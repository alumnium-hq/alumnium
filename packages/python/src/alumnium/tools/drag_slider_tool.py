from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class DragSliderTool(BaseTool):
    """Set slider to a desired value by clicking at the calculated position based on the slider's width and step."""

    id: int = Field(description="Identifier (ID) of the slider element")
    value: float = Field(description="Desired value to set the slider to")

    def invoke(self, driver: BaseDriver):
        driver.drag_slider(self.id, self.value)
