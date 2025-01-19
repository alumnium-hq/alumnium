from pydantic import BaseModel, Field

from alumnium.drivers import PlaywrightDriver, SeleniumDriver


class ClickTool(BaseModel):
    """Click an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: PlaywrightDriver | SeleniumDriver):
        driver.click(self.id)
