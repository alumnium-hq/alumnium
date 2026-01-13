from pydantic import Field

from ..drivers.base_driver import BaseDriver
from .base_tool import BaseTool
from .select_tool import SelectTool
from .upload_tool import UploadTool


class ClickTool(BaseTool):
    __doc__ = (
        "Click an element. "
        f"NEVER open comboboxes with ClickTool - use {SelectTool.__name__} instead. "
        f"NEVER use ClickTool to upload files  - use {UploadTool.__name__} instead."
    )

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: BaseDriver):
        driver.click(self.id)
