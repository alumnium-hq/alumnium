from pydantic import BaseModel, Field

from alumnium.drivers import BaseDriver


class HoverTool(BaseModel):
    """Hover an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: BaseDriver):
        driver.hover(self.id)
