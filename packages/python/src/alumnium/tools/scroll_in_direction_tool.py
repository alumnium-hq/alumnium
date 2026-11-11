from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver
from alumnium.drivers.scroll_area import ScrollDirection

from .base_tool import BaseTool


class ScrollInDirectionTool(BaseTool):
    """Scroll a scrollable area (page, list, panel, chat thread) in a direction by most of its visible height (or width), like a mouse wheel. Use it to reveal content above or below the visible part of the area. To bring a specific element into view, use ScrollTool instead."""  # noqa: E501

    id: int = Field(description="Identifier (ID) of the scrollable area, or of any element inside it")
    direction: ScrollDirection = Field(description="Direction to scroll the content.")

    def invoke(self, driver: BaseDriver):
        driver.scroll_in_direction(self.id, self.direction)
