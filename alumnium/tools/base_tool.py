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
        tool = tools[tool_call["name"]](**tool_call["args"])
        tool.invoke(driver)
