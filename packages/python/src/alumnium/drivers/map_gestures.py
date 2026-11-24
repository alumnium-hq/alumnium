from collections.abc import Mapping
from enum import Enum
from typing import Any

from .scroll_area import ScrollDirection

# Pointer moves between press and release, so the drag is not taken for a click.
PAN_STEPS = 10
# Rest before release, so the drag is not taken for a fling.
PAN_HOLD_DELAY = 0.2
# Maps keep animating and loading tiles after release.
PAN_SETTLE_DELAY = 0.3
# A zoom is a burst of small wheel moves with Control held, like a trackpad
# pinch. Map libraries count the moves, their distance, or both: this burst is
# one zoom level on Google Maps and Leaflet, and less on others.
ZOOM_WHEEL_STEPS = 5
ZOOM_WHEEL_DELTA = 40
# Maps keep animating and loading tiles after zooming.
ZOOM_SETTLE_DELAY = 0.5

Point = tuple[float, float]


class ZoomDirection(str, Enum):
    IN = "in"
    OUT = "out"


def pan_points(frame: dict, direction: ScrollDirection) -> tuple[Point, Point]:
    """Start and end of a drag across the middle half of the frame that moves the view in the direction."""
    if frame["width"] <= 0 or frame["height"] <= 0:
        raise RuntimeError("Map has no visible area")

    x = frame["x"] + frame["width"] / 2
    y = frame["y"] + frame["height"] / 2
    dx = frame["width"] / 4
    dy = frame["height"] / 4
    # The content is dragged away from the direction the view moves in.
    return {
        ScrollDirection.UP: ((x, y - dy), (x, y + dy)),
        ScrollDirection.DOWN: ((x, y + dy), (x, y - dy)),
        ScrollDirection.LEFT: ((x - dx, y), (x + dx, y)),
        ScrollDirection.RIGHT: ((x + dx, y), (x - dx, y)),
    }[direction]


def clip_to_viewport(box: Mapping[str, Any], viewport: Mapping[str, Any]) -> dict:
    """The part of a box in viewport coordinates that is on screen."""
    x = max(box["x"], 0)
    y = max(box["y"], 0)
    width = min(box["x"] + box["width"], viewport["width"]) - x
    height = min(box["y"] + box["height"], viewport["height"]) - y
    if width <= 0 or height <= 0:
        raise RuntimeError("Map has no visible area")
    return {"x": x, "y": y, "width": width, "height": height}


def zoom_wheel_delta(direction: ZoomDirection) -> int:
    """Distance of each wheel move. Wheeling up zooms in."""
    return -ZOOM_WHEEL_DELTA if direction == ZoomDirection.IN else ZOOM_WHEEL_DELTA
