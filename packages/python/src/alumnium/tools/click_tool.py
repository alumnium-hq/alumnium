from pydantic import Field

from ..drivers.base_driver import BaseDriver
from .base_tool import BaseTool
from .upload_tool import UploadTool


class ClickTool(BaseTool):
    __doc__ = (
        "Click an element."
        " NEVER use ClickTool on comboboxes, instead proceed to click the desired option directly."
        f" NEVER use ClickTool to upload files - use {UploadTool.__name__} instead."
    )

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: BaseDriver):
        driver.click(self.id)
