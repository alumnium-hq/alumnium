from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class HoverTool(BaseTool):
    """Hover over an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: BaseDriver):
        driver.hover(self.id)
