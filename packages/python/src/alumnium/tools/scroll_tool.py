from pydantic import Field

from ..drivers.base_driver import BaseDriver
from .base_tool import BaseTool


class ScrollTool(BaseTool):
    """Scroll the page so an element is centered on screen. To scroll a list, panel or page up or down, use ScrollInDirectionTool instead."""  # noqa: E501

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: BaseDriver):
        driver.scroll_to(self.id)
