from pydantic import BaseModel, Field

from alumnium.drivers import PlaywrightDriver, SeleniumDriver


class TypeTool(BaseModel):
    """Types text into an element."""

    id: int = Field(description="Element identifier (ID)")
    text: str = Field(description="Text to type into an element")

    def invoke(self, driver: PlaywrightDriver | SeleniumDriver):
        driver.type(self.id, self.text)
