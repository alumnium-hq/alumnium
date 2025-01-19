from pydantic import BaseModel, Field

from alumnium.drivers import BaseDriver


class TypeTool(BaseModel):
    """Types text into an element."""

    id: int = Field(description="Element identifier (ID)")
    text: str = Field(description="Text to type into an element")

    def invoke(self, driver: BaseDriver):
        driver.type(self.id, self.text)
