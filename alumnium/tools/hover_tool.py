from pydantic import BaseModel, Field

from alumnium.drivers import PlaywrightDriver, SeleniumDriver


class HoverTool(BaseModel):
    """Hover an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: PlaywrightDriver | SeleniumDriver):
        driver.hover(self.id)
