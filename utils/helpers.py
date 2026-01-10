"""
Helper utilities for the application.
"""
import hashlib
from typing import List
import pandas as pd
from io import BytesIO
from datetime import datetime

from models.data_models import ProcessedPart, ImageSession


def generate_image_hash(image_bytes: bytes) -> str:
    """
    Generate hash for image bytes for caching purposes.
    
    Args:
        image_bytes: Binary image data
        
    Returns:
        MD5 hash string
    """
    return hashlib.md5(image_bytes).hexdigest()


def format_confidence(confidence: float) -> str:
    """
    Format confidence score as percentage string.
    
    Args:
        confidence: Confidence score (0.0 to 1.0)
        
    Returns:
        Formatted string (e.g., "95.2%")
    """
    return f"{confidence * 100:.1f}%"


def export_to_csv(parts: List[ProcessedPart]) -> bytes:
    """
    Export list of processed parts to CSV bytes.
    
    Args:
        parts: List of ProcessedPart objects
        
    Returns:
        CSV data as bytes
    """
    # Convert to dictionaries
    data = [part.to_dict() for part in parts]
    
    # Create DataFrame
    df = pd.DataFrame(data)
    
    # Reorder columns for better readability
    column_order = [
        'part_number',
        'part_name',
        'color',
        'quantity',
        'confidence',
        'x', 'y', 'width', 'height'
    ]
    
    # Only include columns that exist
    available_columns = [col for col in column_order if col in df.columns]
    df = df[available_columns]
    
    # Convert to CSV
    csv_buffer = BytesIO()
    df.to_csv(csv_buffer, index=False, encoding='utf-8')
    return csv_buffer.getvalue()


def export_session_to_csv(session: ImageSession) -> bytes:
    """
    Export ImageSession to CSV bytes.
    
    Args:
        session: ImageSession object
        
    Returns:
        CSV data as bytes
    """
    return export_to_csv(session.parts)


def create_summary_statistics(parts: List[ProcessedPart]) -> dict:
    """
    Create summary statistics for processed parts.
    
    Args:
        parts: List of ProcessedPart objects
        
    Returns:
        Dictionary with summary statistics
    """
    total_parts = len(parts)
    total_quantity = sum(part.bounding_box.quantity or 1 for part in parts)
    
    # Count recognized vs failed
    recognized = sum(1 for part in parts if part.recognition_result and not part.recognition_result.error)
    failed = total_parts - recognized
    
    # Average confidence (only for successfully recognized parts)
    confidences = [
        part.recognition_result.confidence 
        for part in parts 
        if part.recognition_result and not part.recognition_result.error
    ]
    avg_confidence = sum(confidences) / len(confidences) if confidences else 0.0
    
    # Unique colors
    colors = set()
    for part in parts:
        if part.recognition_result and part.recognition_result.best_color:
            colors.add(part.recognition_result.best_color.name)
    
    return {
        'total_parts': total_parts,
        'total_quantity': total_quantity,
        'recognized': recognized,
        'failed': failed,
        'avg_confidence': avg_confidence,
        'unique_colors': len(colors),
        'success_rate': (recognized / total_parts * 100) if total_parts > 0 else 0.0
    }


def validate_quantity_input(quantity_str: str) -> tuple[bool, int | None, str]:
    """
    Validate quantity input from user.
    
    Args:
        quantity_str: Quantity as string
        
    Returns:
        Tuple of (is_valid, quantity_value, error_message)
    """
    try:
        quantity = int(quantity_str)
        if quantity < 1:
            return False, None, "Quantity must be at least 1"
        if quantity > 999:
            return False, None, "Quantity must be less than 1000"
        return True, quantity, ""
    except ValueError:
        return False, None, "Please enter a valid number"


def generate_filename(prefix: str = "lego_parts", extension: str = "csv") -> str:
    """
    Generate filename with timestamp.
    
    Args:
        prefix: Filename prefix
        extension: File extension (without dot)
        
    Returns:
        Filename string
    """
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return f"{prefix}_{timestamp}.{extension}"


def truncate_text(text: str, max_length: int = 50) -> str:
    """
    Truncate text to maximum length with ellipsis.
    
    Args:
        text: Text to truncate
        max_length: Maximum length
        
    Returns:
        Truncated text
    """
    if len(text) <= max_length:
        return text
    return text[:max_length - 3] + "..."


def get_color_emoji(color_name: str) -> str:
    """
    Get emoji representation for color name.
    
    Args:
        color_name: Name of the color
        
    Returns:
        Emoji string
    """
    color_map = {
        'red': '🔴',
        'blue': '🔵',
        'green': '🟢',
        'yellow': '🟡',
        'orange': '🟠',
        'purple': '🟣',
        'brown': '🟤',
        'black': '⚫',
        'white': '⚪',
        'gray': '🔘',
        'grey': '🔘',
    }
    
    # Try to find color in map (case-insensitive)
    for key, emoji in color_map.items():
        if key in color_name.lower():
            return emoji
    
    return '🔹'  # Default emoji


def format_part_display_name(part_name: str, max_length: int = 40) -> str:
    """
    Format part name for display.
    
    Args:
        part_name: Original part name
        max_length: Maximum length
        
    Returns:
        Formatted part name
    """
    # Remove common prefixes
    prefixes_to_remove = ['LEGO', 'Brick', 'Plate']
    for prefix in prefixes_to_remove:
        if part_name.startswith(prefix):
            part_name = part_name[len(prefix):].strip()
    
    return truncate_text(part_name, max_length)
