from dataclasses import dataclass
from pathlib import Path
from typing import Awaitable, Callable

SCRIPTS = Path(__file__).parent / "scripts"


class SliderPoint:
    """A pointer position over a slider, relative to the slider element."""

    def __init__(self, step: dict):
        self.x = step["x"]
        self.y = step["y"]
        self.width = step["width"]
        self.height = step["height"]

    def offset(self) -> tuple[float, float]:
        return self.x, self.y

    def center_offset(self) -> tuple[int, int]:
        return round(self.x - self.width / 2), round(self.y - self.height / 2)


@dataclass
class SliderActions:
    """
    How a driver performs slider steps. ARIA sliders only respond to real pointer
    events, so these must not be emulated with scripts.
    """

    next: Callable[[bool], dict | None]
    down: Callable[[SliderPoint], None]
    move: Callable[[SliderPoint], None]
    up: Callable[[], None]


@dataclass
class AsyncSliderActions:
    next: Callable[[bool], Awaitable[dict | None]]
    down: Callable[[SliderPoint], Awaitable[None]]
    move: Callable[[SliderPoint], Awaitable[None]]
    up: Callable[[], Awaitable[None]]


class Slider:
    """
    Sets ARIA sliders by following the steps computed by scripts/slider.js.
    """

    SCRIPT = (SCRIPTS / "slider.js").read_text()
    EXECUTE_SCRIPT = f"return ({SCRIPT})(arguments[0], arguments[1], arguments[2]);"
    EVALUATE_SCRIPT = f"(element, [value, reset]) => ({SCRIPT})(element, value, reset)"
    SET_INPUT_VALUE_SCRIPT = f"({(SCRIPTS / 'setInputValue.js').read_text()})(arguments[0], arguments[1]);"
    MAX_STEPS = 100

    @classmethod
    def set(cls, actions: SliderActions) -> bool:
        """
        Performs steps until the slider reaches the value or gets as close as it can.
        Returns False when the element is a native input, which callers set directly.
        """
        pressed = False
        try:
            for i in range(cls.MAX_STEPS):
                step = actions.next(i == 0)
                if not step:
                    return False
                action = step["action"]
                if action == "done":
                    return True
                if action == "down":
                    pressed = True
                    actions.down(SliderPoint(step))
                elif action == "move":
                    actions.move(SliderPoint(step))
                elif action == "up":
                    pressed = False
                    actions.up()
            return True
        finally:
            # Never leave the pointer pressed, e.g. when the slider got re-rendered.
            if pressed:
                try:
                    actions.up()
                except Exception:
                    pass

    @classmethod
    async def set_async(cls, actions: AsyncSliderActions) -> bool:
        pressed = False
        try:
            for i in range(cls.MAX_STEPS):
                step = await actions.next(i == 0)
                if not step:
                    return False
                action = step["action"]
                if action == "done":
                    return True
                if action == "down":
                    pressed = True
                    await actions.down(SliderPoint(step))
                elif action == "move":
                    await actions.move(SliderPoint(step))
                elif action == "up":
                    pressed = False
                    await actions.up()
            return True
        finally:
            if pressed:
                try:
                    await actions.up()
                except Exception:
                    pass
