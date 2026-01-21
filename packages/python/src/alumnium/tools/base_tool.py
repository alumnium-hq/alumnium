from abc import ABC, abstractmethod

from pydantic import BaseModel

from alumnium.drivers.base_driver import BaseDriver


class BaseTool(ABC, BaseModel):
    @classmethod
    def execute_tool_call(
        cls,
        tool_call: dict,
        tools: dict[str, type["BaseTool"]],
        driver: BaseDriver,
    ) -> str:
        """
        Execute a tool call and return its string representation.

        Returns:
            Formatted string representation of the tool call (e.g., "ClickTool(id=42)").
        """
        tool_name = tool_call.get("name", "")
        tool_args = tool_call.get("args", {})
        tool = tools[tool_name](**tool_args)
        tool.invoke(driver)
        args_str = ", ".join(f"{k}='{v}'" for k, v in tool_args.items())
        return f"{tool_name}({args_str})"

    @abstractmethod
    def invoke(self, driver: BaseDriver):
        pass
