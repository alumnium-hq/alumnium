from pydantic import Field

from alumnium.drivers.base_driver import BaseDriver

from .base_tool import BaseTool


class ExecuteJavascriptTool(BaseTool):
    """Execute a JavaScript snippet in the browser context."""

    script: str = Field(description="JavaScript code to execute")

    def invoke(self, driver: BaseDriver):
        driver.execute_script(self.script)
