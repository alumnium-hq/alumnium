from pydantic import Field

from alumnium.drivers import BaseDriver
from .base_tool import BaseTool


class ClickTool(BaseTool):
    """Click an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: BaseDriver):
        driver.click(self.id)
