"""
OCR service for extracting quantity information from LEGO part images.
"""
import pytesseract
import cv2
import numpy as np
import re
from typing import Optional, Tuple
from PIL import Image


class OCRService:
    """Service for OCR-based text extraction from images."""
    
    @staticmethod
    def extract_quantity(image: np.ndarray) -> Optional[int]:
        """
        Extract quantity from image (e.g., "11x", "2x").
        
        Args:
            image: Image crop containing quantity text
            
        Returns:
            Extracted quantity as integer, or None if not found
        """
        try:
            # Preprocess image for better OCR
            processed = OCRService._preprocess_for_ocr(image)
            
            # Perform OCR
            text = pytesseract.image_to_string(
                processed,
                config='--psm 7 --oem 3 -c tessedit_char_whitelist=0123456789x'
            )
            
            # Extract quantity from text
            quantity = OCRService._parse_quantity_text(text)
            return quantity
            
        except Exception as e:
            print(f"OCR error: {e}")
            return None
    
    @staticmethod
    def _preprocess_for_ocr(image: np.ndarray) -> np.ndarray:
        """
        Preprocess image for better OCR results.
        
        Args:
            image: Original image
            
        Returns:
            Preprocessed image
        """
        # Convert to grayscale
        if len(image.shape) == 3:
            gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
        else:
            gray = image
        
        # Resize if too small
        height, width = gray.shape
        if height < 50 or width < 50:
            scale = max(50 / height, 50 / width)
            new_width = int(width * scale)
            new_height = int(height * scale)
            gray = cv2.resize(gray, (new_width, new_height), interpolation=cv2.INTER_CUBIC)
        
        # Apply thresholding
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        
        # Denoise
        denoised = cv2.fastNlMeansDenoising(thresh, h=10)
        
        return denoised
    
    @staticmethod
    def _parse_quantity_text(text: str) -> Optional[int]:
        """
        Parse quantity from OCR text.
        
        Args:
            text: OCR extracted text
            
        Returns:
            Quantity as integer, or None if not found
        """
        # Clean text
        text = text.strip().lower()
        
        # Pattern matching for common quantity formats
        patterns = [
            r'(\d+)x',      # "11x"
            r'(\d+)\s*x',   # "11 x"
            r'x\s*(\d+)',   # "x11"
            r'^(\d+)$',     # Just a number
        ]
        
        for pattern in patterns:
            match = re.search(pattern, text)
            if match:
                try:
                    quantity = int(match.group(1))
                    # Sanity check: quantity should be reasonable (1-999)
                    if 1 <= quantity <= 999:
                        return quantity
                except ValueError:
                    continue
        
        return None
    
    @staticmethod
    def extract_text_with_confidence(image: np.ndarray) -> Tuple[str, float]:
        """
        Extract text with confidence score.
        
        Args:
            image: Image to extract text from
            
        Returns:
            Tuple of (text, confidence)
        """
        try:
            processed = OCRService._preprocess_for_ocr(image)
            
            # Get detailed OCR data
            data = pytesseract.image_to_data(
                processed, 
                output_type=pytesseract.Output.DICT,
                config='--psm 7 --oem 3'
            )
            
            # Extract text and average confidence
            texts = []
            confidences = []
            
            for i, conf in enumerate(data['conf']):
                if conf > 0:  # Valid confidence
                    text = data['text'][i].strip()
                    if text:
                        texts.append(text)
                        confidences.append(conf)
            
            combined_text = ' '.join(texts)
            avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
            
            return combined_text, avg_confidence / 100.0  # Normalize to 0-1
            
        except Exception as e:
            print(f"OCR error: {e}")
            return "", 0.0
    
    @staticmethod
    def detect_quantity_region(image: np.ndarray) -> Optional[Tuple[int, int, int, int]]:
        """
        Detect region in image that likely contains quantity text.
        Useful for focusing OCR on specific areas.
        
        Args:
            image: Image to analyze
            
        Returns:
            Bounding box as (x, y, width, height) or None
        """
        try:
            # Convert to grayscale
            if len(image.shape) == 3:
                gray = cv2.cvtColor(image, cv2.COLOR_BGR2GRAY)
            else:
                gray = image
            
            # Apply threshold
            _, binary = cv2.threshold(gray, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)
            
            # Find contours
            contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
            
            if not contours:
                return None
            
            # Find largest contour (likely text region)
            largest_contour = max(contours, key=cv2.contourArea)
            x, y, w, h = cv2.boundingRect(largest_contour)
            
            # Add some padding
            padding = 5
            x = max(0, x - padding)
            y = max(0, y - padding)
            w = min(gray.shape[1] - x, w + 2 * padding)
            h = min(gray.shape[0] - y, h + 2 * padding)
            
            return (x, y, w, h)
            
        except Exception as e:
            print(f"Region detection error: {e}")
            return None
    
    @staticmethod
    def is_tesseract_available() -> bool:
        """
        Check if Tesseract OCR is available.
        
        Returns:
            True if Tesseract is available, False otherwise
        """
        try:
            pytesseract.get_tesseract_version()
            return True
        except Exception:
            return False
