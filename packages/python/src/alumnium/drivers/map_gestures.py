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
# Page script that records the distance of the next wheel move it gets.
ZOOM_WHEEL_PROBE = (
    "(() => { window.__alumniumWheel = undefined; "
    'addEventListener("wheel", (event) => { window.__alumniumWheel = event.deltaY; }, '
    "{ capture: true, once: true, passive: true }); })()"
)
# Page expression for the distance recorded by the probe.
ZOOM_WHEEL_RECEIVED = "window.__alumniumWheel"

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


def remaining_zoom_wheel_deltas(direction: ZoomDirection, received: float | None = None) -> list[float]:
    """Wheel moves that follow the first one, given the distance the page received for it.

    A headed Chromium driven by Playwright scales wheel distances by the screen's pixel ratio,
    so the rest of the burst is corrected to make a zoom the same everywhere.
    """
    delta = zoom_wheel_delta(direction)
    scale = received / delta if received and received / delta > 0 else 1
    rest = ZOOM_WHEEL_STEPS - 1
    return [(delta * ZOOM_WHEEL_STEPS - delta * scale) / rest / scale] * rest
