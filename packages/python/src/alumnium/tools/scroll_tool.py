from pydantic import Field

from ..drivers.base_driver import BaseDriver
from .base_tool import BaseTool


class ScrollTool(BaseTool):
    """Scroll to an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: BaseDriver):
        driver.scroll_to(self.id)
