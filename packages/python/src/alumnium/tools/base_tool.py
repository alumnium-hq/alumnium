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
    ):
        tool = tools[tool_call["name"]](**tool_call["args"])
        tool.invoke(driver)

    @abstractmethod
    def invoke(self, driver: BaseDriver):
        pass
