from pydantic import BaseModel, Field

from alumnium.drivers import BaseDriver


class ClickTool(BaseModel):
    """Click an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: BaseDriver):
        driver.click(self.id)
