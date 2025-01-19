from pydantic import BaseModel, Field

from alumnium.drivers import BaseDriver


class SelectTool(BaseModel):
    """Selects an option in a dropdown. Only use this tool if the dropdown is a combobox."""

    id: int = Field(description="Element identifier (ID)")
    option: str = Field(description="Option to select")

    def invoke(self, driver: BaseDriver):
        driver.select(self.id, self.option)
