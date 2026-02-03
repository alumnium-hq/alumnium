from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class NavigateBackTool(BaseTool):
    """Navigate back to the previous page/screen using the browser/app history."""

    def invoke(self, driver: BaseDriver):
        driver.back()
