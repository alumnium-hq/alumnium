from enum import Enum

from pydantic import BaseModel, Field

from alumnium.drivers import PlaywrightDriver, SeleniumDriver


class Key(str, Enum):
    BACKSPACE = "Backspace"
    ENTER = "Enter"
    ESCAPE = "Escape"
    TAB = "Tab"


class PressKeyTool(BaseModel):
    """Presses a key on the keyboard."""

    key: Key = Field(description="Key to press.")

    def invoke(self, driver: PlaywrightDriver | SeleniumDriver):
        driver.press_key(self.key)
