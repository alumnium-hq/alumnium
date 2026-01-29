from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class SwitchToNextTabTool(BaseTool):
    """Switch to the next browser tab/window.

    Use this when the user asks to:
    - Switch to the next tab
    - Go to the next tab
    - Move to the next browser window
    - Cycle to the next tab

    If on the last tab, wraps around to the first tab.
    """

    def invoke(self, driver: BaseDriver):
        driver.switch_to_next_tab()
