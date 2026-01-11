"""
Image processing service for LEGO part recognition.
"""
import cv2
import numpy as np
from PIL import Image
from io import BytesIO
from typing import Tuple, Optional
import base64

from models.data_models import BoundingBox


class ImageProcessor:
    """Service for processing images and extracting LEGO parts."""
    
    @staticmethod
    def load_image_from_bytes(image_bytes: bytes) -> np.ndarray:
        """
        Load image from bytes into numpy array.
        
        Args:
            image_bytes: Binary image data
            
        Returns:
            numpy array in BGR format (OpenCV format)
        """
        nparr = np.frombuffer(image_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        return img
    
    @staticmethod
    def load_image_from_uploaded_file(uploaded_file) -> np.ndarray:
        """
        Load image from uploaded file.
        
        Args:
            uploaded_file: Uploaded file object
            
        Returns:
            numpy array in BGR format
        """
        image = Image.open(uploaded_file)
        # Convert to RGB if needed
        if image.mode != 'RGB':
            image = image.convert('RGB')
        # Convert PIL to OpenCV format (BGR)
        img_array = np.array(image)
        img_bgr = cv2.cvtColor(img_array, cv2.COLOR_RGB2BGR)
        return img_bgr
    
    @staticmethod
    def crop_image(image: np.ndarray, bbox: BoundingBox) -> np.ndarray:
        """
        Crop image using bounding box coordinates.
        
        Args:
            image: Original image as numpy array
            bbox: BoundingBox with crop coordinates
            
        Returns:
            Cropped image as numpy array
        """
        x, y, w, h = bbox.x, bbox.y, bbox.width, bbox.height
        
        # Ensure coordinates are within image bounds
        height, width = image.shape[:2]
        x = max(0, min(x, width - 1))
        y = max(0, min(y, height - 1))
        w = min(w, width - x)
        h = min(h, height - y)
        
        cropped = image[y:y+h, x:x+w]
        return cropped
    
    @staticmethod
    def remove_text_from_image(image: np.ndarray) -> tuple[np.ndarray, dict]:
        """
        Remove text (like '2x', '3x') from LEGO part images using Tesseract OCR + inpainting.
        
        Args:
            image: Input image as numpy array
            
        Returns:
            Tuple of (processed image, stats dict with 'text_found', 'text_removed', 'detected_text')
        """
        stats = {'text_found': False, 'text_removed': False, 'detected_text': [], 'error': None}
        
        try:
            # Create a copy to avoid modifying original
            result = image.copy()
            
            # Skip if image is too small
            if image.shape[0] < 20 or image.shape[1] < 20:
                stats['error'] = 'Image too small'
                return image, stats
            
            # Convert RGBA to RGB if needed
            if len(image.shape) == 3 and image.shape[2] == 4:
                result = cv2.cvtColor(result, cv2.COLOR_BGRA2BGR)
                image_for_ocr = result
            else:
                image_for_ocr = result
            
            # Convert to grayscale for OCR
            gray = cv2.cvtColor(image_for_ocr, cv2.COLOR_BGR2GRAY)
            
            # Enhance contrast for better OCR
            gray = cv2.equalizeHist(gray)
            
            # Use pytesseract to detect text bounding boxes
            # config: only recognize digits and 'x' character, treat as single uniform block
            custom_config = r'--psm 11 -c tessedit_char_whitelist=0123456789xX'
            data = pytesseract.image_to_data(gray, config=custom_config, output_type=pytesseract.Output.DICT)
            
            # Debug: print ALL detected text (even low confidence)
            all_detections = []
            for i in range(len(data['text'])):
                text = str(data['text'][i]).strip()
                conf = int(data['conf'][i]) if data['conf'][i] != '-1' else 0
                if text:
                    all_detections.append(f"{text}({conf}%)")
            
            if all_detections:
                print(f"[Text Removal] All OCR detections: {', '.join(all_detections)}")
            else:
                print(f"[Text Removal] OCR found NO text at all (image size: {image.shape})")
            
            # Create mask for inpainting - must match image dimensions
            mask = np.zeros((image.shape[0], image.shape[1]), dtype=np.uint8)
            
            # Mark text regions in mask
            n_boxes = len(data['text'])
            text_regions_found = 0
            
            for i in range(n_boxes):
                text = str(data['text'][i]).strip()
                conf = int(data['conf'][i]) if data['conf'][i] != '-1' else 0
                
                # Only process if confidence is decent and text matches pattern like "2x", "11x"
                if conf > 20 and text and ('x' in text.lower() or text.isdigit()):
                    stats['detected_text'].append(f"{text} ({conf}%)")
                    
                    (x, y, w, h) = (data['left'][i], data['top'][i], 
                                    data['width'][i], data['height'][i])
                    
                    # Add padding around text
                    padding = 5
                    x = max(0, x - padding)
                    y = max(0, y - padding)
                    w = min(image.shape[1] - x, w + 2 * padding)
                    h = min(image.shape[0] - y, h + 2 * padding)
                    
                    # Mark region in mask
                    if w > 0 and h > 0:
                        cv2.rectangle(mask, (x, y), (x + w, y + h), 255, -1)
                        text_regions_found += 1
            
            stats['text_found'] = text_regions_found > 0
            
            # Only inpaint if text regions were found
            if np.any(mask):
                result = cv2.inpaint(result, mask, 7, cv2.INPAINT_TELEA)
                stats['text_removed'] = True
                print(f"[Text Removal] Removed {text_regions_found} text regions: {stats['detected_text']}")
            else:
                print(f"[Text Removal] No text regions found to remove")
            
            return result, stats
            
        except Exception as e:
            # If text removal fails, return original image silently
            stats['error'] = str(e)
            print(f"[Text Removal] Error: {e}")
            return image, stats
    
    @staticmethod
    def image_to_bytes(image: np.ndarray, format: str = 'JPEG') -> bytes:
        """
        Convert numpy array image to bytes.
        
        Args:
            image: Image as numpy array
            format: Output format (JPEG, PNG)
            
        Returns:
            Image as bytes
        """
        # Convert BGR to RGB for PIL
        if len(image.shape) == 3 and image.shape[2] == 3:
            image_rgb = cv2.cvtColor(image, cv2.COLOR_BGR2RGB)
        else:
            image_rgb = image
        
        pil_image = Image.fromarray(image_rgb)
        
        # Convert RGBA to RGB if necessary (for JPEG format)
        if pil_image.mode == 'RGBA':
            # Create a white background
            rgb_image = Image.new('RGB', pil_image.size, (255, 255, 255))
            rgb_image.paste(pil_image, mask=pil_image.split()[3])  # Use alpha channel as mask
            pil_image = rgb_image
        elif pil_image.mode != 'RGB':
            pil_image = pil_image.convert('RGB')
        
        buffer = BytesIO()
        pil_image.save(buffer, format=format, quality=95)
        return buffer.getvalue()
    
    @staticmethod
    def resize_image(image: np.ndarray, max_dimension: int = 1920) -> np.ndarray:
        """
        Resize image if it exceeds maximum dimension while maintaining aspect ratio.
        
        Args:
            image: Image as numpy array
            max_dimension: Maximum width or height
            
        Returns:
            Resized image
        """
        height, width = image.shape[:2]
        
        if max(height, width) <= max_dimension:
            return image
        
        if width > height:
            new_width = max_dimension
            new_height = int(height * (max_dimension / width))
        else:
            new_height = max_dimension
            new_width = int(width * (max_dimension / height))
        
        resized = cv2.resize(image, (new_width, new_height), interpolation=cv2.INTER_AREA)
        return resized
    
    @staticmethod
    def enhance_contrast(image: np.ndarray) -> np.ndarray:
        """
        Enhance image contrast using CLAHE (Contrast Limited Adaptive Histogram Equalization).
        
        Args:
            image: Image as numpy array
            
        Returns:
            Enhanced image
        """
        # Convert to LAB color space
        lab = cv2.cvtColor(image, cv2.COLOR_BGR2LAB)
        l, a, b = cv2.split(lab)
        
        # Apply CLAHE to L channel
        clahe = cv2.createCLAHE(clipLimit=2.0, tileGridSize=(8, 8))
        l = clahe.apply(l)
        
        # Merge channels and convert back to BGR
        enhanced_lab = cv2.merge([l, a, b])
        enhanced = cv2.cvtColor(enhanced_lab, cv2.COLOR_LAB2BGR)
        
        return enhanced
    
    @staticmethod
    def image_to_base64(image: np.ndarray) -> str:
        """
        Convert image to base64 string for display.
        
        Args:
            image: Image as numpy array
            
        Returns:
            Base64 encoded string
        """
        image_bytes = ImageProcessor.image_to_bytes(image, format='JPEG')
        return base64.b64encode(image_bytes).decode()
    
    @staticmethod
    def get_image_dimensions(image: np.ndarray) -> Tuple[int, int]:
        """
        Get image dimensions.
        
        Args:
            image: Image as numpy array
            
        Returns:
            Tuple of (width, height)
        """
        height, width = image.shape[:2]
        return width, height
    
    @staticmethod
    def validate_bounding_box(bbox: BoundingBox, image_shape: Tuple[int, int]) -> bool:
        """
        Validate that bounding box is within image bounds and has valid dimensions.
        
        Args:
            bbox: BoundingBox to validate
            image_shape: (width, height) of image
            
        Returns:
            True if valid, False otherwise
        """
        width, height = image_shape
        
        if bbox.x < 0 or bbox.y < 0:
            return False
        if bbox.width <= 0 or bbox.height <= 0:
            return False
        if bbox.x + bbox.width > width:
            return False
        if bbox.y + bbox.height > height:
            return False
        
        return True
    
    @staticmethod
    def draw_bounding_boxes(
        image: np.ndarray, 
        bboxes: list, 
        color: Tuple[int, int, int] = (0, 255, 0),
        thickness: int = 2
    ) -> np.ndarray:
        """
        Draw bounding boxes on image.
        
        Args:
            image: Image as numpy array
            bboxes: List of BoundingBox objects
            color: BGR color tuple
            thickness: Line thickness
            
        Returns:
            Image with drawn bounding boxes
        """
        result = image.copy()
        
        for idx, bbox in enumerate(bboxes):
            x, y, w, h = bbox.x, bbox.y, bbox.width, bbox.height
            cv2.rectangle(result, (x, y), (x + w, y + h), color, thickness)
            
            # Draw label with index
            label = f"#{idx + 1}"
            if bbox.quantity:
                label += f" ({bbox.quantity}x)"
            
            cv2.putText(
                result, 
                label, 
                (x, y - 10), 
                cv2.FONT_HERSHEY_SIMPLEX, 
                0.6, 
                color, 
                2
            )
        
        return result
