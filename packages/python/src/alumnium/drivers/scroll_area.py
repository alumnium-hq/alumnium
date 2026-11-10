from dataclasses import dataclass
from enum import Enum

from .slider import SCRIPTS


class ScrollDirection(str, Enum):
    UP = "up"
    DOWN = "down"
    LEFT = "left"
    RIGHT = "right"


@dataclass
class ScrollArea:
    """
    The visible area that scrolls an element, as computed by scripts/scrollArea.js:
    its visible size and visible center, as an offset from the element's top-left
    corner and in top-level viewport coordinates (across frames).
    """

    offset_x: float
    offset_y: float
    viewport_x: float
    viewport_y: float
    width: float
    height: float

    SCRIPT = (SCRIPTS / "scrollArea.js").read_text()
    # Playwright invokes an expression that evaluates to a function with the element.
    EVALUATE_SCRIPT = f"({SCRIPT})"
    EXECUTE_SCRIPT = f"return ({SCRIPT})(arguments[0]);"
    # Fraction of the scroll area scrolled by one call, leaving some overlap.
    AREA_FRACTION = 0.8
    # Wheel input does not wait for scrolling to finish.
    SETTLE_DELAY = 0.3

    @classmethod
    def from_script(cls, result: dict | None) -> "ScrollArea | None":
        if not result:
            return None
        return cls(
            offset_x=result["offsetX"],
            offset_y=result["offsetY"],
            viewport_x=result["viewportX"],
            viewport_y=result["viewportY"],
            width=result["width"],
            height=result["height"],
        )

    def wheel_delta(self, direction: ScrollDirection) -> tuple[int, int]:
        """Wheel delta in pixels: most of the area's visible size in the direction."""
        x = round(self.width * self.AREA_FRACTION)
        y = round(self.height * self.AREA_FRACTION)
        return {
            ScrollDirection.UP: (0, -y),
            ScrollDirection.DOWN: (0, y),
            ScrollDirection.LEFT: (-x, 0),
            ScrollDirection.RIGHT: (x, 0),
        }[direction]
