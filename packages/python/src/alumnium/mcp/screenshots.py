"""Screenshot management utilities for MCP server."""

import base64
from re import sub

from alumnium import Alumni

from ..server.logutils import get_logger
from .state import artifacts_dirs, step_counters

logger = get_logger(__name__)


def save_screenshot(driver_id: str, description: str, al: Alumni) -> None:
    """Save a screenshot with step number prefix and sanitized description."""
    try:
        # Get current step number and increment
        step_num = step_counters[driver_id]
        step_counters[driver_id] += 1

        # Sanitize description for filename
        # Remove special characters and limit length
        sanitized = sub(r"[^\w\s-]", "", description)
        sanitized = sub(r"\s+", "-", sanitized.strip())
        sanitized = sanitized[:50]  # Truncate to 50 chars

        # Get screenshot directory
        screenshot_dir = artifacts_dirs[driver_id] / "screenshots"
        screenshot_dir.mkdir(parents=True, exist_ok=True)

        # Create filename with step number prefix
        filename = f"{step_num:02d}-{sanitized}.jpg"
        filepath = screenshot_dir / filename

        # Get base64 screenshot from driver
        screenshot_b64 = al.driver.screenshot

        # Decode base64 and save as JPG
        screenshot_bytes = base64.b64decode(screenshot_b64)
        filepath.write_bytes(screenshot_bytes)

        logger.debug(f"Driver {driver_id}: Saved screenshot to {filepath}")

    except Exception as e:
        # Log error but don't fail the operation
        logger.warning(f"Failed to save screenshot for driver {driver_id}: {e}")
