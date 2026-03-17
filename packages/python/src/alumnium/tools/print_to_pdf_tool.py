from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class PrintToPdfTool(BaseTool):
    """Print the current page to a PDF file."""

    filepath: str = Field(description="Path to save the PDF file to")

    def invoke(self, driver: BaseDriver):
        driver.print_to_pdf(self.filepath)
