from pydantic import BaseModel, Field
from alumnium.drivers import SeleniumDriver


class HoverTool(BaseModel):
    """Hover an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: SeleniumDriver):
        driver.hover(self.id)
