from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class SwitchToNextTabTool(BaseTool):
    """Switch to the next browser tab/window."""

    def invoke(self, driver: BaseDriver):
        driver.switch_to_next_tab()
