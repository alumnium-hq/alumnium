from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver
from alumnium.drivers.keys import Key

from .base_tool import BaseTool


class PressKeyTool(BaseTool):
    """Press a keyboard key. Does not require element to be focused."""

    key: Key = Field(description="Key to press.")

    def invoke(self, driver: BaseDriver):
        driver.press_key(self.key)
