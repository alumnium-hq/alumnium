from pydantic import BaseModel

from alumnium.accessibility import BaseAccessibilityTree
from alumnium.drivers.base_driver import BaseDriver


class BaseTool(BaseModel):
    @classmethod
    def execute_tool_call(
        cls,
        tool_call: dict,
        tools: list["BaseTool"],
        accessibility_tree: BaseAccessibilityTree,
        driver: BaseDriver,
    ):
        tool = tools[tool_call["name"]](**tool_call["args"])

        if "id" in tool.model_fields_set:
            tool.id = accessibility_tree.element_by_id(tool.id).id
        if "from_id" in tool.model_fields_set:
            tool.from_id = accessibility_tree.element_by_id(tool.from_id).id
        if "to_id" in tool.model_fields_set:
            tool.to_id = accessibility_tree.element_by_id(tool.to_id).id

        tool.invoke(driver)
