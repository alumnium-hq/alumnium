from pydantic import BaseModel, Field

from alumnium.drivers import BaseDriver
from alumnium.drivers.keys import Key


class PressKeyTool(BaseModel):
    """Presses a key on the keyboard."""

    key: Key = Field(description="Key to press.")

    def invoke(self, driver: BaseDriver):
        driver.press_key(self.key)
