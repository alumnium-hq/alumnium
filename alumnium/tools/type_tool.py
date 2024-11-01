from pydantic import BaseModel, Field
from alumnium.drivers import SeleniumDriver


class TypeTool(BaseModel):
    """Types text into an element."""

    id: int = Field(description="Element identifier (ID)")
    text: str = Field(description="Text to type into an element")
    submit: bool = Field(description="Submit after typing text by pressing `Enter` key")

    def invoke(self, driver: SeleniumDriver):
        driver.type(self.id, self.text, self.submit)
