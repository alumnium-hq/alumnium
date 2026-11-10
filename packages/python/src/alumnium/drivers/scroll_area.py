from enum import Enum

from .slider import SCRIPTS

SCRIPT = (SCRIPTS / "scrollArea.js").read_text()
# Playwright calls an expression that evaluates to a function with the element.
EVALUATE_SCRIPT = f"({SCRIPT})"
EXECUTE_SCRIPT = f"return ({SCRIPT})(arguments[0]);"
# Wheel input does not wait for scrolling to finish.
SETTLE_DELAY = 0.3


class ScrollDirection(str, Enum):
    UP = "up"
    DOWN = "down"
    LEFT = "left"
    RIGHT = "right"


def wheel_delta(direction: ScrollDirection, area: dict) -> tuple[int, int]:
    """Scrolls 80% of the area's visible size, so consecutive scrolls overlap."""
    x = round(area["width"] * 0.8)
    y = round(area["height"] * 0.8)
    return {
        ScrollDirection.UP: (0, -y),
        ScrollDirection.DOWN: (0, y),
        ScrollDirection.LEFT: (-x, 0),
        ScrollDirection.RIGHT: (x, 0),
    }[direction]
