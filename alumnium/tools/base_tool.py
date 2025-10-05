from pydantic import BaseModel

from alumnium.drivers.base_driver import BaseDriver


class BaseTool(BaseModel):
    @classmethod
    def execute_tool_call(
        cls,
        tool_call: dict,
        tools: list["BaseTool"],
        element_lookup,  # Session object with element_by_id method
        driver: BaseDriver,
    ):
        tool = tools[tool_call["name"]](**tool_call["args"])

        # Use element_lookup (session) to map tree IDs to backend IDs
        if element_lookup:
            if "id" in tool.model_fields_set:
                tool.id = element_lookup.element_by_id(tool.id).id
            if "from_id" in tool.model_fields_set:
                tool.from_id = element_lookup.element_by_id(tool.from_id).id
            if "to_id" in tool.model_fields_set:
                tool.to_id = element_lookup.element_by_id(tool.to_id).id

        tool.invoke(driver)
