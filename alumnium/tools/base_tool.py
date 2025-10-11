from pydantic import BaseModel

from alumnium.drivers.base_driver import BaseDriver


class BaseTool(BaseModel):
    @classmethod
    def execute_tool_call(
        cls,
        tool_call: dict,
        tools: list["BaseTool"],
        driver: BaseDriver,
    ):
        """
        Execute a tool call.

        Args:
            tool_call: Tool call dict with name and args (IDs should be platform-specific)
            tools: Available tool classes
            driver: Driver to execute the tool on
        """
        tool = tools[tool_call["name"]](**tool_call["args"])
        tool.invoke(driver)
