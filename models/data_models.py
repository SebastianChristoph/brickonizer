"""
Data models for LEGO part recognition application.
"""
from dataclasses import dataclass, field
from typing import List, Optional, Tuple
from datetime import datetime


@dataclass
class BoundingBox:
    """Represents a bounding box for a LEGO part in an image."""
    x: int
    y: int
    width: int
    height: int
    quantity: Optional[int] = None
    ocr_text: Optional[str] = None


@dataclass
class ColorCandidate:
    """Represents a color candidate from Brickognize API."""
    name: str
    score: float
    rgb: Optional[Tuple[int, int, int]] = None


@dataclass
class PartRecognitionResult:
    """Result from Brickognize API for a single part."""
    part_id: Optional[str] = None
    part_name: Optional[str] = None
    bricklink_id: Optional[str] = None
    colors: List[ColorCandidate] = field(default_factory=list)
    confidence: float = 0.0
    quantity: Optional[int] = None
    error: Optional[str] = None
    raw_response: Optional[dict] = None  # Store complete API response
    image_url: Optional[str] = None  # API reference image URL
    
    @property
    def best_color(self) -> Optional[ColorCandidate]:
        """Returns the color with the highest score."""
        if self.colors:
            return max(self.colors, key=lambda c: c.score)
        return None


@dataclass
class ProcessedPart:
    """Complete information about a processed LEGO part."""
    image_name: str
    bounding_box: BoundingBox
    part_crop: any = None  # numpy array
    recognition_result: Optional[PartRecognitionResult] = None
    image_crop: Optional[bytes] = None
    timestamp: datetime = field(default_factory=datetime.now)
    
    def to_dict(self) -> dict:
        """Convert to dictionary for export."""
        result = {
            'part_number': self.recognition_result.bricklink_id if self.recognition_result else 'N/A',
            'part_name': self.recognition_result.part_name if self.recognition_result else 'Unknown',
            'color': self.recognition_result.best_color.name if self.recognition_result and self.recognition_result.best_color else 'Unknown',
            'quantity': self.bounding_box.quantity or 1,
            'confidence': f"{self.recognition_result.confidence:.2%}" if self.recognition_result else 'N/A',
            'x': self.bounding_box.x,
            'y': self.bounding_box.y,
            'width': self.bounding_box.width,
            'height': self.bounding_box.height
        }
        return result


@dataclass
class ImageSession:
    """Represents a processing session for a single image."""
    image_name: str
    image_data: any  # numpy array
    processed_parts: List[ProcessedPart] = field(default_factory=list)
    created_at: datetime = field(default_factory=datetime.now)
    
    def add_part(self, part: ProcessedPart):
        """Add a processed part to the session."""
        self.processed_parts.append(part)
    
    def get_total_parts(self) -> int:
        """Get total number of parts including quantities."""
        return sum(part.bounding_box.quantity or 1 for part in self.processed_parts)
    
    def to_export_list(self) -> List[dict]:
        """Convert all parts to list of dictionaries for export."""
        return [part.to_dict() for part in self.processed_parts]
