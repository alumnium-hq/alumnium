import base64
import io
import logging
from typing import Dict, List, Tuple, Optional, Union

from PIL import Image

logger = logging.getLogger(__name__)


def _extract_box_coordinates(content_box: List[float]) -> Tuple[int, int, int, int]:
    """
    Extract the bounding rectangle coordinates from a content box.

    Args:
        content_box: List of 8 coordinates representing the 4 corners of the box
                     in clockwise order starting from the top-left

    Returns:
        Tuple of (x, y, width, height) coordinates
    """
    # Find the bounding rectangle by getting min/max coordinates
    x = min(content_box[0], content_box[2], content_box[4], content_box[6])
    y = min(content_box[1], content_box[3], content_box[5], content_box[7])
    width = max(content_box[0], content_box[2], content_box[4], content_box[6]) - x
    height = max(content_box[1], content_box[3], content_box[5], content_box[7]) - y

    return int(x), int(y), int(width), int(height)


def get_area_screenshot_from_box_model(
    full_screenshot: Union[bytes, str],
    box_model: Dict,
    is_base64: bool = False
) -> str:
    """
    Extract an area screenshot from a full screenshot using box model coordinates.

    Args:
        full_screenshot: Full screenshot as bytes or base64 string
        box_model: Box model returned from DOM.getBoxModel
        is_base64: Whether the full_screenshot is already base64 encoded

    Returns:
        Base64 encoded PNG screenshot of the specified area
    """
    # Extract coordinates from the box model
    content_box = box_model["model"]["content"]
    x, y, width, height = _extract_box_coordinates(content_box)

    logger.debug(f"Element bounds: x={x}, y={y}, width={width}, height={height}")

    # Convert base64 to bytes if needed
    if is_base64 and isinstance(full_screenshot, str):
        full_screenshot = base64.b64decode(full_screenshot)

    buffer = io.BytesIO()
    area_screenshot_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    if isinstance(full_screenshot, bytes):
        full_screenshot_base64 = base64.b64encode(full_screenshot).decode('utf-8')
        logger.debug(f"Full screenshot encoded string: {full_screenshot_base64}...")
    elif isinstance(full_screenshot, str) and is_base64:
        logger.debug(f"Full screenshot encoded string: {full_screenshot}...")

    logger.debug(f"Area screenshot encoded string: {area_screenshot_base64}...")

    return area_screenshot_base64


def get_area_screenshot_from_rect(
    full_screenshot: Union[bytes, str],
    rect: Dict[str, int],
    is_base64: bool = False
) -> str:
    """
    Extract an area screenshot from a full screenshot using rectangle coordinates.

    Args:
        full_screenshot: Full screenshot as bytes or base64 string
        rect: Dictionary with 'x', 'y', 'width', 'height' keys
        is_base64: Whether the full_screenshot is already base64 encoded

    Returns:
        Base64 encoded PNG screenshot of the specified area
    """
    x, y = rect['x'], rect['y']
    width, height = rect['width'], rect['height']

    logger.debug(f"Element bounds: x={x}, y={y}, width={width}, height={height}")

    # Convert base64 to bytes if needed
    if is_base64 and isinstance(full_screenshot, str):
        full_screenshot = base64.b64decode(full_screenshot)

    # Open and crop the image
    image = Image.open(io.BytesIO(full_screenshot))
    cropped_image = image.crop((x, y, x + width, y + height))

    # Convert cropped image to base64
    buffer = io.BytesIO()
    cropped_image.save(buffer, format='PNG')
    area_screenshot_base64 = base64.b64encode(buffer.getvalue()).decode('utf-8')

    # Log the first 100 chars of the full screenshot and area screenshot for debugging
    if isinstance(full_screenshot, bytes):
        full_screenshot_base64 = base64.b64encode(full_screenshot).decode('utf-8')
        logger.info(f"Full screenshot (first 100 chars): {full_screenshot_base64[:100]}...")
    elif isinstance(full_screenshot, str) and is_base64:
        logger.info(f"Full screenshot (first 100 chars): {full_screenshot[:100]}...")

    logger.info(f"Area screenshot (first 100 chars): {area_screenshot_base64[:100]}...")

    return area_screenshot_base64
