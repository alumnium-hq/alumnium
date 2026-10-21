from pathlib import Path


class Slider:
    """
    Where to drag an ARIA slider to reach a value, as computed by scripts/slider.js.
    """

    SCRIPT = (Path(__file__).parent / "scripts/slider.js").read_text()
    EXECUTE_SCRIPT = f"return ({SCRIPT})(arguments[0], arguments[1]);"

    def __init__(self, geometry: dict):
        self.start = geometry["from"]
        self.end = geometry["to"]
        self.width = geometry["width"]
        self.height = geometry["height"]

    @classmethod
    def parse(cls, result: dict | None) -> "Slider | None":
        return cls(result) if result else None

    def start_offset(self) -> tuple[float, float]:
        return self.start["x"], self.start["y"]

    def end_offset(self) -> tuple[float, float]:
        return self.end["x"], self.end["y"]

    def start_center_offset(self) -> tuple[int, int]:
        return self._center_offset(self.start)

    def end_center_offset(self) -> tuple[int, int]:
        return self._center_offset(self.end)

    def _center_offset(self, point: dict) -> tuple[int, int]:
        return round(point["x"] - self.width / 2), round(point["y"] - self.height / 2)
