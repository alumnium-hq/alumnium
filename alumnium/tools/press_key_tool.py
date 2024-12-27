from enum import Enum

from pydantic import BaseModel, Field
from alumnium.drivers import SeleniumDriver


class Key(str, Enum):
    enter = "Enter"


class PressKeyTool(BaseModel):
    """Presses a key on the keyboard."""

    key: Key = Field(description="Key to press.")

    def invoke(self, driver: SeleniumDriver):
        driver.press_key(self.key)
