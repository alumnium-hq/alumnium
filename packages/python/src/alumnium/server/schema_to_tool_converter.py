from typing import Any, Dict, List, Type

from pydantic import Field

from alumnium.tools.base_tool import BaseTool


def _json_type_to_python_type(json_type: str) -> Type:
    """Convert JSON schema type to Python type."""
    type_map = {
        "integer": int,
        "string": str,
        "boolean": bool,
        "number": float,
        "array": list,
        "object": dict,
    }
    return type_map.get(json_type, str)


def _create_tool_class_from_schema(schema: Dict[str, Any]) -> Type[BaseTool]:
    """Dynamically create a tool class from a schema."""
    function_info = schema["function"]
    tool_name = function_info["name"]
    description = function_info.get("description", f"Execute {tool_name}")
    parameters = function_info.get("parameters", {})
    properties = parameters.get("properties", {})
    required = set(parameters.get("required", []))

    # Create field annotations and defaults
    annotations = {}
    field_defaults = {}

    for field_name, field_info in properties.items():
        field_type = _json_type_to_python_type(field_info.get("type", "string"))
        field_description = field_info.get("description", f"{field_name} parameter")

        # Set type annotation
        annotations[field_name] = field_type

        # Create Field with description
        if field_name in required:
            field_defaults[field_name] = Field(description=field_description)
        else:
            field_defaults[field_name] = Field(default=None, description=field_description)

    # Create empty invoke method
    def invoke(self, driver):
        """Empty invoke method - to be implemented by actual tool execution."""
        pass

    # Create class attributes
    class_attrs = {"__doc__": description, "__annotations__": annotations, "invoke": invoke, **field_defaults}

    # Create the class
    return type(tool_name, (BaseTool,), class_attrs)


def convert_schemas_to_tools(schemas: List[Dict[str, Any]]) -> Dict[str, Type[BaseTool]]:
    """Convert tool schemas to dynamically created tool classes."""
    tools = {}

    for schema in schemas:
        if "function" in schema and "name" in schema["function"]:
            tool_name = schema["function"]["name"]
            tool_class = _create_tool_class_from_schema(schema)
            tools[tool_name] = tool_class

    return tools
