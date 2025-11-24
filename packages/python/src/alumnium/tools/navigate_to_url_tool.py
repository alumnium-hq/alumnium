from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class NavigateToUrlTool(BaseTool):
    """Navigate to or open the URL."""

    url: str = Field(description="URL to navigate to")

    def invoke(self, driver: BaseDriver):
        driver.visit(self.url)
