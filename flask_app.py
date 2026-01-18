"""
Flask-based LEGO Part Recognition Web Application
"""
from flask import Flask, render_template, request, jsonify, session
import os
import base64
import asyncio
from io import BytesIO
from werkzeug.utils import secure_filename
from werkzeug.middleware.proxy_fix import ProxyFix
from PIL import Image
import numpy as np
import cv2
import uuid
from datetime import datetime
import fitz  # PyMuPDF
import pytesseract

from models import BoundingBox, ProcessedPart, ImageSession
from services import ImageProcessor, get_api_instance
from utils.bricklink_colors import BricklinkColorMap

# Configure Tesseract path for Windows
if os.name == 'nt':  # Windows
    tesseract_path = r'C:\Program Files\Tesseract-OCR\tesseract.exe'
    if os.path.exists(tesseract_path):
        pytesseract.pytesseract.tesseract_cmd = tesseract_path

app = Flask(__name__)

# Configure for reverse proxy (nginx)
app.wsgi_app = ProxyFix(app.wsgi_app, x_for=1, x_proto=1, x_host=1, x_prefix=1)

# Session configuration for HTTPS with reverse proxy
app.secret_key = 'your-secret-key-change-this-in-production-use-env-variable'
app.config['SESSION_COOKIE_SECURE'] = True  # Only send cookie over HTTPS
app.config['SESSION_COOKIE_HTTPONLY'] = True
app.config['SESSION_COOKIE_SAMESITE'] = 'Lax'
app.config['UPLOAD_FOLDER'] = 'uploads'
app.config['MAX_CONTENT_LENGTH'] = 100 * 1024 * 1024  # 100MB max for PDFs

# Ensure upload folder exists
os.makedirs(app.config['UPLOAD_FOLDER'], exist_ok=True)

# In-memory storage for sessions (in production, use Redis or database)
sessions = {}


@app.route('/')
def index():
    """Main page - upload and mark parts"""
    session_id = session.get('session_id')
    if not session_id:
        session_id = str(uuid.uuid4())
        session['session_id'] = session_id
        sessions[session_id] = {
            'images': {},
            'current_image': None,
            'analyzed_parts': [],
            'created_at': datetime.now().isoformat()
        }
    
    return render_template('index.html')


@app.route('/upload', methods=['POST'])
def upload_images():
    """Handle image uploads"""
    session_id = session.get('session_id')
    if not session_id:
        session_id = str(uuid.uuid4())
        session['session_id'] = session_id
    
    # Initialize session if it doesn't exist (e.g., after server restart)
    if session_id not in sessions:
        sessions[session_id] = {
            'images': {},
            'current_image': None,
            'analyzed_parts': [],
            'pdf_pages': {}
        }
    
    # Ensure pdf_pages exists (for older sessions)
    if 'pdf_pages' not in sessions[session_id]:
        sessions[session_id]['pdf_pages'] = {}
    
    # Clear analyzed parts when uploading new images
    # to prevent mixing old crops with new original images
    sessions[session_id]['analyzed_parts'] = []
    
    files = request.files.getlist('images')
    uploaded = []
    
    for file in files:
        if file and file.filename:
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_{filename}")
            file.save(filepath)
            
            # Load image
            image = Image.open(filepath)
            image_np = np.array(image)
            
            # Store in session
            sessions[session_id]['images'][filename] = {
                'filepath': filepath,
                'image_np': image_np,
                'boxes': []
            }
            
            uploaded.append({
                'filename': filename,
                'url': f'/image/{filename}'
            })
    
    return jsonify({'uploaded': uploaded})


@app.route('/upload_pdf', methods=['POST'])
def upload_pdf():
    """Handle PDF upload and extract pages"""
    session_id = session.get('session_id')
    if not session_id:
        session_id = str(uuid.uuid4())
        session['session_id'] = session_id
    
    # Initialize session if needed
    if session_id not in sessions:
        sessions[session_id] = {
            'images': {},
            'current_image': None,
            'analyzed_parts': [],
            'pdf_pages': {}
        }
    
    # Ensure pdf_pages exists (for older sessions)
    if 'pdf_pages' not in sessions[session_id]:
        sessions[session_id]['pdf_pages'] = {}
    
    # Clear analyzed parts when uploading new PDF
    # to prevent mixing old crops with new original images
    sessions[session_id]['analyzed_parts'] = []
    
    pdf_file = request.files.get('pdf')
    if not pdf_file:
        return jsonify({'error': 'No PDF file provided'}), 400
    
    try:
        # Read PDF
        pdf_bytes = pdf_file.read()
        doc = fitz.open(stream=pdf_bytes, filetype="pdf")
        
        pages_info = []
        pdf_id = str(uuid.uuid4())[:8]
        
        # Generate thumbnails for each page
        for page_num in range(len(doc)):
            page = doc[page_num]
            
            # Render page as image (thumbnail for preview)
            pix = page.get_pixmap(dpi=72)  # Low DPI for thumbnails
            img_data = pix.tobytes("png")
            
            # Convert to base64 for frontend
            thumbnail_base64 = base64.b64encode(img_data).decode('utf-8')
            
            # Store page info
            page_key = f"{pdf_id}_page_{page_num}"
            sessions[session_id]['pdf_pages'][page_key] = {
                'pdf_bytes': pdf_bytes,
                'page_num': page_num,
                'pdf_id': pdf_id
            }
            
            pages_info.append({
                'page_num': page_num,
                'page_key': page_key,
                'thumbnail': thumbnail_base64
            })
        
        doc.close()
        
        return jsonify({
            'page_count': len(pages_info),
            'pages': pages_info,
            'pdf_id': pdf_id
        })
        
    except Exception as e:
        return jsonify({'error': f'PDF processing failed: {str(e)}'}), 500


@app.route('/convert_pdf_pages', methods=['POST'])
def convert_pdf_pages():
    """Convert selected PDF pages to images"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    data = request.json
    selected_pages = data.get('pages', [])  # List of page_keys
    
    if not selected_pages:
        return jsonify({'error': 'No pages selected'}), 400
    
    converted = []
    
    try:
        for page_key in selected_pages:
            page_data = sessions[session_id]['pdf_pages'].get(page_key)
            if not page_data:
                continue
            
            # Open PDF and get page
            doc = fitz.open(stream=page_data['pdf_bytes'], filetype="pdf")
            page = doc[page_data['page_num']]
            
            # Render page at high DPI for actual use
            pix = page.get_pixmap(dpi=150)
            
            # Convert to PIL Image
            img_bytes = pix.tobytes("png")
            from io import BytesIO
            image = Image.open(BytesIO(img_bytes))
            
            # Save as image file
            filename = f"pdf_{page_data['pdf_id']}_page_{page_data['page_num']}.png"
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], f"{session_id}_{filename}")
            image.save(filepath)
            
            # Store in session
            image_np = np.array(image)
            sessions[session_id]['images'][filename] = {
                'filepath': filepath,
                'image_np': image_np,
                'boxes': []
            }
            
            converted.append({
                'filename': filename,
                'url': f'/image/{filename}'
            })
            
            doc.close()
        
        return jsonify({'converted': converted})
        
    except Exception as e:
        return jsonify({'error': f'Conversion failed: {str(e)}'}), 500


@app.route('/get_often_parts')
def get_often_parts():
    """Get list of often unrecognized parts from static/often folder"""
    import os
    often_dir = os.path.join(app.static_folder, 'often')
    
    if not os.path.exists(often_dir):
        return jsonify({'parts': []})
    
    parts = []
    for filename in os.listdir(often_dir):
        if filename.endswith('.png'):
            part_num = filename.replace('.png', '')
            parts.append({
                'number': part_num,
                'image': f'/static/often/{filename}'
            })
    
    # Sort by part number
    parts.sort(key=lambda x: x['number'])
    
    return jsonify({'parts': parts})


@app.route('/image/<filename>')
def get_image(filename):
    """Serve uploaded image"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return 'Not found', 404
    
    image_data = sessions[session_id]['images'].get(filename)
    if not image_data:
        return 'Not found', 404
    
    from flask import send_file
    return send_file(image_data['filepath'])


@app.route('/save_boxes', methods=['POST'])
def save_boxes():
    """Save bounding boxes for an image"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    data = request.json
    filename = data.get('filename')
    boxes = data.get('boxes', [])
    
    if filename in sessions[session_id]['images']:
        # Convert boxes to BoundingBox objects
        bbox_objects = []
        for box in boxes:
            bbox = BoundingBox(
                x=int(box['x']),
                y=int(box['y']),
                width=int(box['width']),
                height=int(box['height'])
            )
            bbox_objects.append(bbox)
        
        sessions[session_id]['images'][filename]['boxes'] = bbox_objects
        return jsonify({'success': True, 'count': len(bbox_objects)})
    
    return jsonify({'error': 'Image not found'}), 404


@app.route('/get_boxes/<filename>')
def get_boxes(filename):
    """Get saved bounding boxes for an image"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    image_data = sessions[session_id]['images'].get(filename)
    if not image_data:
        return jsonify({'error': 'Image not found'}), 404
    
    boxes = []
    for bbox in image_data['boxes']:
        boxes.append({
            'x': bbox.x,
            'y': bbox.y,
            'width': bbox.width,
            'height': bbox.height
        })
    
    return jsonify({'boxes': boxes})


@app.route('/crop_text_from_boxes', methods=['POST'])
def crop_text_from_boxes():
    """Crop boxes to remove text annotations like '2x', '4x' using OCR"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    data = request.json
    filename = data.get('filename')
    boxes = data.get('boxes', [])
    
    if not filename or filename not in sessions[session_id]['images']:
        return jsonify({'error': 'Image not found'}), 404
    
    if not boxes:
        return jsonify({'success': True, 'boxes': [], 'modified': 0})
    
    try:
        # Load image
        image_path = sessions[session_id]['images'][filename]['filepath']
        img = cv2.imread(image_path)
        
        if img is None:
            return jsonify({'error': f'Failed to load image from {image_path}'}), 500
        
        modified_boxes = []
        modified_count = 0
        debug_info = []
        
        for idx, box in enumerate(boxes):
            x, y, w, h = int(box['x']), int(box['y']), int(box['width']), int(box['height'])
            
            # Extract box region
            box_img = img[y:y+h, x:x+w]
            
            # ONLY analyze the BOTTOM 40% of the box (where text typically is)
            text_region_start = int(h * 0.6)
            text_region = box_img[text_region_start:, :]
            
            # Upscale 3x for better OCR
            scale = 3
            text_region_large = cv2.resize(text_region, None, fx=scale, fy=scale, 
                                          interpolation=cv2.INTER_CUBIC)
            
            # Convert to grayscale
            gray = cv2.cvtColor(text_region_large, cv2.COLOR_BGR2GRAY)
            
            # Apply strong threshold to get black text on white background
            _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
            
            all_detections = []
            best_text_y = None
            best_text = None
            text_found = False
            
            try:
                # Use PSM 7 (single text line) since quantities are always single line
                ocr_text = pytesseract.image_to_string(thresh, config='--psm 7').strip()
                all_detections.append(f"full:{ocr_text[:30]}")
                
                # Get detailed position data
                ocr_data = pytesseract.image_to_data(thresh, config='--psm 7',
                                                     output_type=pytesseract.Output.DICT)
                
                for i in range(len(ocr_data['text'])):
                    text = str(ocr_data['text'][i]).strip()
                    conf = int(ocr_data['conf'][i]) if ocr_data['conf'][i] != '-1' else 0
                    
                    if text and conf > 10:
                        all_detections.append(f"{text}({conf}%)")
                        
                        # Look for patterns: "Nx" or just "N" where N is 1-3 digits
                        text_lower = text.lower()
                        is_quantity = ('x' in text_lower) or (text.replace('i', '1').replace('l', '1').isdigit() and 1 <= len(text) <= 3)
                        
                        if is_quantity:
                            # Convert to scaled coordinates
                            text_y_scaled = int(ocr_data['top'][i])
                            # Convert back to original image coords
                            text_y_original = text_region_start + (text_y_scaled // scale)
                            
                            if best_text_y is None or text_y_original < best_text_y:
                                best_text_y = text_y_original
                                best_text = text
                                text_found = True
                
            except Exception as e:
                all_detections.append(f"ERROR: {str(e)[:50]}")
            
            debug_info.append({
                'box': idx + 1,
                'detections': all_detections,
                'text_found': text_found,
                'best_text': best_text,
                'best_y': best_text_y
            })
            
            # If text was found, crop the box
            if text_found and best_text_y is not None and best_text_y > 10:
                # Extend box slightly BELOW the top of the text (add padding instead of subtract)
                relative_padding = max(4, int(h * 0.06))  # 6% of height to go slightly below text start
                new_height = best_text_y + relative_padding  # ADD padding to go below text
                
                if 20 < new_height < h * 0.95:
                    modified_boxes.append({
                        'x': x,
                        'y': y,
                        'width': w,
                        'height': new_height
                    })
                    modified_count += 1
                else:
                    modified_boxes.append(box)
            else:
                modified_boxes.append(box)
        
        return jsonify({
            'success': True, 
            'boxes': modified_boxes, 
            'modified': modified_count,
            'total': len(boxes)
        })
    
    except ImportError:
        return jsonify({'error': 'pytesseract not available'}), 500
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/detect_quantity', methods=['POST'])
def detect_quantity():
    """Detect quantity text (like '2x', '3x') below a bounding box"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    data = request.json
    filename = data.get('filename')
    box = data.get('box')  # {x, y, width, height}
    
    if not filename or not box:
        return jsonify({'error': 'Missing filename or box'}), 400
    
    if filename not in sessions[session_id]['images']:
        return jsonify({'error': 'Image not found'}), 404
    
    try:
        # Load image
        image_path = sessions[session_id]['images'][filename]['filepath']
        img = cv2.imread(image_path)
        
        if img is None:
            return jsonify({'error': f'Failed to load image'}), 500
        
        img_height, img_width = img.shape[:2]
        
        x = int(box['x'])
        y = int(box['y'])
        w = int(box['width'])
        h = int(box['height'])
        
        # Extract region BELOW the box (half of box height)
        region_height = int(h * 0.5)
        region_y = y + h  # Start right below the box
        region_x = x
        region_w = w
        
        # Ensure we don't go out of bounds
        if region_y + region_height > img_height:
            region_height = img_height - region_y
        
        if region_height < 10:
            return jsonify({
                'success': False,
                'quantity': None,
                'message': 'Region too small'
            })
        
        # Extract the region
        region = img[region_y:region_y+region_height, region_x:region_x+region_w]
        
        # Upscale 3x for better OCR
        scale = 3
        region_large = cv2.resize(region, None, fx=scale, fy=scale, 
                                  interpolation=cv2.INTER_CUBIC)
        
        # Convert to grayscale
        gray = cv2.cvtColor(region_large, cv2.COLOR_BGR2GRAY)
        
        # Apply threshold
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Try OCR
        try:
            # Use PSM 7 for single line
            ocr_text = pytesseract.image_to_string(thresh, config='--psm 7').strip()
            
            # Look for quantity patterns: "2x", "11x", "41x", etc.
            import re
            
            # Pattern: digits followed by 'x' (case insensitive)
            # Also handle common OCR mistakes: 'i', 'l' as '1', 'o' as '0'
            ocr_cleaned = ocr_text.lower().replace('i', '1').replace('l', '1').replace('o', '0')
            
            # Find patterns like "2x" or "11x"
            match = re.search(r'(\d{1,3})\s*x', ocr_cleaned)
            
            if match:
                quantity = int(match.group(1))
                
                return jsonify({
                    'success': True,
                    'quantity': quantity,
                    'raw_text': ocr_text,
                    'cleaned_text': ocr_cleaned
                })
            else:
                # Try to find just digits without 'x'
                digits_match = re.search(r'\b(\d{1,2})\b', ocr_cleaned)
                if digits_match:
                    quantity = int(digits_match.group(1))
                    if 1 <= quantity <= 99:
                        return jsonify({
                            'success': True,
                            'quantity': quantity,
                            'raw_text': ocr_text,
                            'cleaned_text': ocr_cleaned,
                            'note': 'Found digits without x'
                        })
                
                return jsonify({
                    'success': False,
                    'quantity': None,
                    'raw_text': ocr_text,
                    'message': 'No quantity pattern found'
                })
                
        except Exception as e:
            return jsonify({
                'success': False,
                'quantity': None,
                'error': str(e)
            })
        
    except Exception as e:
        import traceback
        traceback.print_exc()
        return jsonify({'error': str(e)}), 500


@app.route('/auto_detect_boxes', methods=['POST'])
def auto_detect_boxes():
    """Automatically detect bounding boxes using OpenCV contour detection"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    data = request.json
    filename = data.get('filename')
    
    if not filename or filename not in sessions[session_id]['images']:
        return jsonify({'error': 'Image not found'}), 404
    
    try:
        # Load image
        image_path = sessions[session_id]['images'][filename]['filepath']
        img = cv2.imread(image_path)
        
        if img is None:
            return jsonify({'error': f'Failed to load image from {image_path}'}), 500
        
        # Convert to grayscale
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
        # Apply binary threshold using Otsu's method (automatically finds best threshold)
        _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
        
        # Morphological operations to connect nearby components
        kernel = np.ones((5, 5), np.uint8)
        binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel, iterations=2)
        
        # Find contours
        contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        
        # Filter and convert contours to bounding boxes
        boxes = []
        height, width = img.shape[:2]
        
        # Use absolute pixel sizes instead of percentage
        # Typical LEGO part in a parts list: 500-50000 pixels at typical resolution
        min_area = 300   # Minimum size (small studs, connectors)
        max_area = 80000  # Maximum size (large plates/baseplates)
        
        for contour in contours:
            area = cv2.contourArea(contour)
            if min_area < area < max_area:
                x, y, w, h = cv2.boundingRect(contour)
                
                # Add some padding to the part itself
                padding = 5
                x = max(0, x - padding)
                y = max(0, y - padding)
                w = min(width - x, w + 2 * padding)
                h = min(height - y, h + 2 * padding)
                
                # Only keep if still reasonable size after shrinking
                if w > 20 and h > 20:
                    boxes.append({
                        'x': int(x),
                        'y': int(y),
                        'width': int(w),
                        'height': int(h)
                    })
        
        # Sort boxes by Y position then X position (top to bottom, left to right)
        boxes.sort(key=lambda b: (b['y'], b['x']))
        
        return jsonify({'success': True, 'boxes': boxes, 'count': len(boxes)})
    
    except Exception as e:
        return jsonify({'error': str(e)}), 500


@app.route('/analysis_progress')
def get_analysis_progress():
    """Get current analysis progress"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    progress = sessions[session_id].get('analysis_progress')
    in_progress = sessions[session_id].get('analysis_in_progress', False)
    
    if progress:
        return jsonify({**progress, 'in_progress': in_progress})
    else:
        return jsonify({'current': 0, 'total': 0, 'percentage': 0, 'in_progress': in_progress})


@app.route('/analyze', methods=['POST'])
def analyze_parts():
    """Analyze all marked parts"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    session_data = sessions[session_id]
    
    # Check if analysis is already in progress
    if session_data.get('analysis_in_progress', False):
        return jsonify({
            'error': 'Analysis already in progress',
            'message': 'An analysis is already running in your browser session. Please wait for it to complete before starting a new one. (This can happen if you have multiple tabs open.)'
        }), 409  # 409 Conflict
    all_parts = []
    
    # Collect all parts from all images
    for filename, image_data in session_data['images'].items():
        image_np = image_data['image_np']
        boxes = image_data['boxes']
        
        for idx, bbox in enumerate(boxes):
            # Crop image
            crop = ImageProcessor.crop_image(image_np, bbox)
            
            # Create processed part
            part = ProcessedPart(
                image_name=filename,
                bounding_box=bbox,
                part_crop=crop,
                recognition_result=None
            )
            all_parts.append(part)
    
    # Initialize progress tracking and set lock
    session_data['analysis_in_progress'] = True
    session_data['analysis_progress'] = {'current': 0, 'total': len(all_parts), 'percentage': 0}
    
    # Run async analysis
    loop = asyncio.new_event_loop()
    asyncio.set_event_loop(loop)
    loop.run_until_complete(analyze_all_parts_async(all_parts, session_id))
    loop.close()
    
    # Store results
    session_data['analyzed_parts'] = all_parts
    
    # Clear lock
    session_data['analysis_in_progress'] = False
    
    # Return summary
    total = len(all_parts)
    recognized = sum(1 for p in all_parts if p.recognition_result and not p.recognition_result.error)
    
    return jsonify({
        'success': True,
        'total': total,
        'recognized': recognized,
        'failed': total - recognized
    })


async def analyze_all_parts_async(parts, session_id):
    """Analyze all parts with rate limiting to avoid API overload"""
    api = get_api_instance()
    total = len(parts)
    
    # Process parts sequentially with small delay to avoid overwhelming API
    for idx, part in enumerate(parts, 1):
        # Check if analysis was cancelled
        if session_id in sessions and sessions[session_id].get('analysis_cancelled', False):
            print(f"Analysis cancelled by user at part {idx}/{total}")
            break
            
        try:
            # Update progress
            if session_id in sessions:
                sessions[session_id]['analysis_progress'] = {
                    'current': idx,
                    'total': total,
                    'percentage': int((idx / total) * 100)
                }
            
            # Convert crop to bytes
            crop_bytes = ImageProcessor.image_to_bytes(part.part_crop)
            
            # Call API
            result = await api.recognize_part(
                crop_bytes,
                external_catalogs="bricklink",
                predict_color=True
            )
            part.recognition_result = result
            
            # Small delay between requests (500ms)
            await asyncio.sleep(0.5)
            
        except Exception as e:
            print(f"Error analyzing part: {e}")
            part.recognition_result = None
    
    # Clear progress when done
    if session_id in sessions:
        sessions[session_id]['analysis_progress'] = None


@app.route('/cancel_analysis', methods=['POST'])
def cancel_analysis():
    """Cancel ongoing analysis"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    session_data = sessions[session_id]
    
    # Clear analysis flags
    session_data['analysis_in_progress'] = False
    session_data['analysis_progress'] = None
    session_data['analysis_cancelled'] = True
    
    return jsonify({'success': True, 'message': 'Analysis cancelled'})


@app.route('/results')
def results():
    """Results page showing annotated images"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return 'Invalid session', 400
    
    return render_template('results.html')


@app.route('/get_results')
def get_results():
    """Get analysis results as JSON"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    parts = sessions[session_id].get('analyzed_parts', [])
    
    results = []
    for idx, part in enumerate(parts):
        # Convert crop to base64 for display
        crop_base64 = None
        if part.part_crop is not None:
            crop_bytes = ImageProcessor.image_to_bytes(part.part_crop)
            crop_base64 = base64.b64encode(crop_bytes).decode('utf-8')
        
        result_data = {
            'index': idx,
            'image_name': part.image_name,
            'recognized': part.recognition_result is not None and not part.recognition_result.error,
            'crop_image': crop_base64,
            'bbox': {
                'x': part.bounding_box.x,
                'y': part.bounding_box.y,
                'width': part.bounding_box.width,
                'height': part.bounding_box.height
            },
            'box': {
                'x': part.bounding_box.x,
                'y': part.bounding_box.y,
                'width': part.bounding_box.width,
                'height': part.bounding_box.height
            }
        }
        
        if part.recognition_result and not part.recognition_result.error:
            result_data['part_id'] = part.recognition_result.part_id
            result_data['part_name'] = part.recognition_result.part_name
            result_data['confidence'] = part.recognition_result.confidence
            result_data['colors'] = [
                {'name': c.name, 'score': c.score}
                for c in part.recognition_result.colors
            ]
            # Add API image if available
            if hasattr(part.recognition_result, 'image_url') and part.recognition_result.image_url:
                result_data['api_image_url'] = part.recognition_result.image_url
            # Add full raw API response for details/debugging
            if hasattr(part.recognition_result, 'raw_response') and part.recognition_result.raw_response:
                result_data['raw_api_response'] = part.recognition_result.raw_response
        
        results.append(result_data)
    
    return jsonify({'results': results})


@app.route('/review')
def review():
    """Review wizard page"""
    return render_template('review.html')


@app.route('/update_part', methods=['POST'])
def update_part():
    """Update part details during review"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    data = request.json
    part_idx = data.get('index')
    part_num = data.get('part_num')
    color_id = data.get('color_id')
    quantity = data.get('quantity', 1)
    skip = data.get('skip', False)
    unknown = data.get('unknown', False)
    no_match = data.get('no_match', False)
    
    parts = sessions[session_id].get('analyzed_parts', [])
    
    if part_idx is not None and part_idx < len(parts):
        part = parts[part_idx]
        
        # Store user input
        if not hasattr(part, 'user_data'):
            part.user_data = {}
        
        part.user_data['part_num'] = part_num
        part.user_data['color_id'] = color_id
        part.user_data['quantity'] = quantity
        part.user_data['skip'] = skip
        part.user_data['unknown'] = unknown
        part.user_data['no_match'] = no_match
        
        return jsonify({'success': True})
    
    return jsonify({'error': 'Part not found'}), 404

@app.route('/remove_part', methods=['POST'])
def remove_part():
    """Remove a part from the analyzed parts list"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    data = request.json
    part_idx = data.get('index')
    
    parts = sessions[session_id].get('analyzed_parts', [])
    
    if part_idx is not None and 0 <= part_idx < len(parts):
        # Remove the part from the list
        removed_part = parts.pop(part_idx)
        
        return jsonify({
            'success': True,
            'new_total': len(parts),
            'removed_index': part_idx
        })
    
    return jsonify({'error': 'Part not found'}), 404


@app.route('/export')
def export_json():
    """Export final JSON"""
    # Clean up old files in uploads folder (older than 24h)
    import os, time
    uploads_dir = app.config['UPLOAD_FOLDER']
    now = time.time()
    deleted_files = 0
    for fname in os.listdir(uploads_dir):
        fpath = os.path.join(uploads_dir, fname)
        try:
            if os.path.isfile(fpath):
                mtime = os.path.getmtime(fpath)
                if now - mtime > 24 * 3600:
                    os.remove(fpath)
                    deleted_files += 1
        except Exception as e:
            pass
    
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return jsonify({'error': 'Invalid session'}), 400
    
    parts = sessions[session_id].get('analyzed_parts', [])
    
    valid_parts = []
    skipped_count = 0
    unknown_count = 0
    
    for part in parts:
        if hasattr(part, 'user_data'):
            if part.user_data.get('unknown') or part.user_data.get('no_match'):
                unknown_count += 1
            elif part.user_data.get('skip'):
                skipped_count += 1
            elif part.user_data.get('part_num'):
                # Get color ID - convert name to ID if needed
                color_value = part.user_data.get('color_id')
                color_id = None
                
                # Check if it's a color name instead of ID
                if color_value:
                    colors = BricklinkColorMap.get_all_colors()
                    
                    # If color_value is already an integer, use it
                    if isinstance(color_value, int):
                        color_id = color_value
                    # If it's a string that looks like a number, convert it
                    elif isinstance(color_value, str) and color_value.isdigit():
                        color_id = int(color_value)
                    else:
                        # Try to find by name
                        for cid, (name, rgb) in colors.items():
                            if name == color_value:
                                color_id = cid
                                break
                
                # Ensure color_id is either None or int, never string
                if color_id is not None and not isinstance(color_id, int):
                    color_id = None
                
                # Get original name and clean it
                original_name = 'Unknown'
                if part.recognition_result and part.recognition_result.part_name:
                    # Remove non-ASCII characters to prevent JSON parse errors
                    original_name = part.recognition_result.part_name.encode('ascii', 'ignore').decode('ascii')
                
                valid_parts.append({
                    'partNum': part.user_data['part_num'],
                    'colorId': color_id if color_id is not None else None,
                    'quantity': part.user_data['quantity'],
                    'originalName': original_name,
                    'confidence': part.recognition_result.confidence if part.recognition_result else 0.0
                })
    
    result = {
        'totalParts': len(parts),
        'recognizedParts': len(valid_parts),
        'unrecognizedCount': unknown_count,
        'skippedCount': skipped_count,
        'parts': valid_parts
    }
    
    return jsonify(result)


@app.route('/export_bricklink_xml')
def export_bricklink_xml():
    """Export as BrickLink XML format"""
    session_id = session.get('session_id')
    if not session_id or session_id not in sessions:
        return 'Invalid session', 400
    
    parts = sessions[session_id].get('analyzed_parts', [])
    
    # Build XML
    xml_parts = []
    
    for part in parts:
        if hasattr(part, 'user_data'):
            # Skip parts marked as skip, unknown or no_match
            if part.user_data.get('skip') or part.user_data.get('unknown') or part.user_data.get('no_match'):
                continue
            
            part_num = part.user_data.get('part_num')
            color_value = part.user_data.get('color_id')
            quantity = part.user_data.get('quantity', 1)
            
            if not part_num:
                continue
            
            # Convert color name to ID if needed
            color_id = color_value
            if color_value:
                colors = BricklinkColorMap.get_all_colors()
                for cid, (name, rgb) in colors.items():
                    if name == color_value:
                        color_id = cid
                        break
            
            # Create XML item
            xml_item = f'''<ITEM>
<ITEMTYPE>P</ITEMTYPE>
<ITEMID>{part_num}</ITEMID>
<COLOR>{color_id if color_id else 0}</COLOR>
<MAXPRICE>-1.0000</MAXPRICE>
<MINQTY>{quantity}</MINQTY>
<CONDITION>X</CONDITION>
<NOTIFY>N</NOTIFY>
</ITEM>'''
            xml_parts.append(xml_item)
    
    # Build complete XML
    xml_content = '<?xml version="1.0" encoding="UTF-8"?>\n<INVENTORY>\n'
    xml_content += '\n'.join(xml_parts)
    xml_content += '\n</INVENTORY>'
    
    # Create response with download
    from flask import make_response
    response = make_response(xml_content)
    response.headers['Content-Type'] = 'application/xml'
    response.headers['Content-Disposition'] = 'attachment; filename=bricklink_wanted_list.xml'
    
    return response


@app.route('/colors')
def get_colors():
    """Get all BrickLink colors"""
    colors = BricklinkColorMap.get_all_colors()
    
    color_list = []
    for color_id, (name, rgb) in colors.items():
        color_list.append({
            'id': color_id,
            'name': name,
            'rgb': rgb
        })
    
    return jsonify({'colors': color_list})


@app.route('/check_session')
def check_session():
    """Check if session should be reset (on page load)"""
    session_id = session.get('session_id')
    
    if not session_id or session_id not in sessions:
        return jsonify({'should_reset': True})
    
    session_data = sessions[session_id]
    created_at_str = session_data.get('created_at')
    
    if not created_at_str:
        return jsonify({'should_reset': True})
    
    # Check if session is from a previous page load (more than 5 seconds old)
    created_at = datetime.fromisoformat(created_at_str)
    age_seconds = (datetime.now() - created_at).total_seconds()
    
    # If session is older than 5 seconds, it's from a previous load
    should_reset = age_seconds > 5
    
    return jsonify({'should_reset': should_reset, 'age': age_seconds})


@app.route('/reset_session', methods=['POST'])
def reset_session():
    """Reset current session and create a new one"""
    old_session_id = session.get('session_id')
    
    # Clean up old session data
    if old_session_id and old_session_id in sessions:
        # Delete uploaded files
        session_data = sessions[old_session_id]
        for filename, image_data in session_data.get('images', {}).items():
            filepath = image_data.get('filepath')
            if filepath and os.path.exists(filepath):
                try:
                    os.remove(filepath)
                except:
                    pass
        
        # Remove from sessions dict
        del sessions[old_session_id]
    
    # Create new session
    new_session_id = str(uuid.uuid4())
    session['session_id'] = new_session_id
    sessions[new_session_id] = {
        'images': {},
        'current_image': None,
        'analyzed_parts': [],
        'created_at': datetime.now().isoformat()
    }
    
    return jsonify({'success': True, 'session_id': new_session_id})


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=False)
