from pydantic import BaseModel, Field
from alumnium.drivers import SeleniumDriver


class ClickTool(BaseModel):
    """Click an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: SeleniumDriver):
        driver.click(self.id)
