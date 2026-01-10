"""
Brickognize API service for LEGO part recognition.
"""
import httpx
import asyncio
from typing import Optional, List
from io import BytesIO
import time

from models.data_models import PartRecognitionResult, ColorCandidate


class BrickognizeAPI:
    """Client for Brickognize API."""
    
    BASE_URL = "https://api.brickognize.com"
    SEARCH_ENDPOINT = "/predict/"  # Public API endpoint (legacy but stable)
    
    def __init__(self, rate_limit_delay: float = 0.2):
        """
        Initialize Brickognize API client.
        
        Args:
            rate_limit_delay: Delay in seconds between API calls (default 0.2s for 5 req/sec limit)
        """
        self.rate_limit_delay = rate_limit_delay
        self.last_call_time = 0
        
    async def _wait_for_rate_limit(self):
        """Wait if necessary to respect rate limiting."""
        current_time = time.time()
        time_since_last_call = current_time - self.last_call_time
        
        if time_since_last_call < self.rate_limit_delay:
            await asyncio.sleep(self.rate_limit_delay - time_since_last_call)
        
        self.last_call_time = time.time()
    
    async def recognize_part(
        self, 
        image_bytes: bytes, 
        predict_color: bool = True,
        external_catalogs: str = "bricklink"
    ) -> PartRecognitionResult:
        """
        Send image to Brickognize API for part recognition.
        
        Args:
            image_bytes: Binary image data
            predict_color: Whether to predict color
            external_catalogs: External catalog to use (default: bricklink)
            
        Returns:
            PartRecognitionResult with recognized part information
        """
        await self._wait_for_rate_limit()
        
        try:
            # Simple headers as per official documentation
            headers = {
                'accept': 'application/json'
            }
            
            async with httpx.AsyncClient(timeout=30.0) as client:
                # Send as multipart/form-data
                files = {
                    'query_image': ('part.jpg', image_bytes, 'image/jpeg')
                }
                
                # Build URL with query parameters for color prediction
                url = f"{self.BASE_URL}{self.SEARCH_ENDPOINT}"
                params = {
                    'external_catalogs': external_catalogs,
                    'predict_color': str(predict_color).lower()
                }
                
                response = await client.post(
                    url,
                    files=files,
                    headers=headers,
                    params=params
                )
                
                if response.status_code == 200:
                    return self._parse_response(response.json())
                
                if response.status_code != 200:
                    return PartRecognitionResult(
                        error=f"API Error: {response.status_code} - {response.text[:200]}"
                    )
                    
        except httpx.TimeoutException:
            return PartRecognitionResult(error="Request timeout")
        except httpx.RequestError as e:
            return PartRecognitionResult(error=f"Request error: {str(e)}")
        except Exception as e:
            return PartRecognitionResult(error=f"Unexpected error: {str(e)}")
    
    def _parse_response(self, response_data: dict) -> PartRecognitionResult:
        """
        Parse Brickognize API response into PartRecognitionResult.
        
        Args:
            response_data: JSON response from API
            
        Returns:
            PartRecognitionResult object
        """
        try:
            # Correct API structure: items[] and colors[] at top level
            items = response_data.get('items', [])
            if not items:
                return PartRecognitionResult(error="No parts found in response", raw_response=response_data)
            
            # Get first (best) match - highest score
            best_match = items[0]
            
            # Extract part information
            part_id = best_match.get('id')  # e.g., "3022"
            part_name = best_match.get('name', 'Unknown Part')  # e.g., "Plate 2 x 2"
            confidence = best_match.get('score', 0.0)
            image_url = best_match.get('img_url')  # Reference image from API
            
            # Extract color predictions from top-level colors array
            colors = []
            color_predictions = response_data.get('colors', [])
            
            for color_data in color_predictions:
                color = ColorCandidate(
                    name=color_data.get('name', 'Unknown'),
                    score=color_data.get('score', 0.0),
                    rgb=None
                )
                colors.append(color)
            
            return PartRecognitionResult(
                part_id=str(part_id) if part_id else None,
                part_name=part_name,
                bricklink_id=str(part_id) if part_id else None,  # id IS the bricklink ID
                colors=colors,
                confidence=confidence,
                image_url=image_url,
                raw_response=response_data  # Store complete response
            )
            
        except Exception as e:
            return PartRecognitionResult(
                error=f"Error parsing response: {str(e)}",
                raw_response=response_data
            )
    
    async def recognize_parts_batch(
        self, 
        image_bytes_list: List[bytes],
        progress_callback=None
    ) -> List[PartRecognitionResult]:
        """
        Recognize multiple parts with progress tracking.
        
        Args:
            image_bytes_list: List of image binary data
            progress_callback: Optional callback function for progress updates
            
        Returns:
            List of PartRecognitionResult objects
        """
        results = []
        total = len(image_bytes_list)
        
        for idx, image_bytes in enumerate(image_bytes_list):
            result = await self.recognize_part(image_bytes)
            results.append(result)
            
            if progress_callback:
                progress_callback(idx + 1, total)
        
        return results


# Singleton instance
_api_instance: Optional[BrickognizeAPI] = None


def get_api_instance() -> BrickognizeAPI:
    """Get or create singleton API instance."""
    global _api_instance
    if _api_instance is None:
        _api_instance = BrickognizeAPI(rate_limit_delay=0.2)  # 5 requests per second
    return _api_instance
