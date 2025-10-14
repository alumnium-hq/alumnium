from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class TypeTool(BaseTool):
    """Type text into an element."""

    id: int = Field(description="Element identifier (ID)")
    text: str = Field(description="Text to type into an element")

    def invoke(self, driver: BaseDriver):
        driver.type(self.id, self.text)
