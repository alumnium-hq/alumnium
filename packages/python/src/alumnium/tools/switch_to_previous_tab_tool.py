from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class SwitchToPreviousTabTool(BaseTool):
    """Switch to the previous browser tab/window.

    Use this when the user asks to:
    - Switch to the previous tab
    - Go to the previous tab
    - Go back to the previous tab
    - Move to the previous browser window

    If on the first tab, wraps around to the last tab.
    """

    def invoke(self, driver: BaseDriver):
        driver.switch_to_previous_tab()
