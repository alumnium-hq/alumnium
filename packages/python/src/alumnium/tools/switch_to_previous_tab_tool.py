from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class SwitchToPreviousTabTool(BaseTool):
    """Switch to the previous browser tab/window."""

    def invoke(self, driver: BaseDriver):
        driver.switch_to_previous_tab()
