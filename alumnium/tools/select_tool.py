from pydantic import BaseModel, Field
from alumnium.drivers import SeleniumDriver


class SelectTool(BaseModel):
    """Selects an option in a dropdown."""

    id: int = Field(description="Element identifier (ID)")
    option: str = Field(description="Option to select")

    def invoke(self, driver: SeleniumDriver):
        driver.select(self.id, self.option)
