from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class DragTool(BaseTool):
    """Drag element by a pixel offset."""

    id: int = Field(description="Identifier (ID) of element to drag")
    offset_x: int = Field(description="Horizontal pixel offset to drag by")
    offset_y: int = Field(description="Vertical pixel offset to drag by")

    def invoke(self, driver: BaseDriver):
        driver.drag(self.id, self.offset_x, self.offset_y)
