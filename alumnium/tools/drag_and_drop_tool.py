from pydantic import BaseModel, Field
from alumnium.drivers import SeleniumDriver


class DragAndDropTool(BaseModel):
    """Drag one element onto another and drop it. Don't combine with HoverTool."""

    from_id: int = Field(description="Identifier (ID) of element to drag")
    to_id: int = Field(description="Identifier (ID) of element to drop onto")

    def invoke(self, driver: SeleniumDriver):
        driver.drag_and_drop(self.from_id, self.to_id)
