from typing import Any, Dict, List, Type, get_origin

from .base_tool import BaseTool


def _pydantic_to_json_type(annotation: Type) -> str:
    """Convert Pydantic field type to JSON schema type."""
    if annotation is int:
        return "integer"
    elif annotation is str:
        return "string"
    elif annotation is bool:
        return "boolean"
    elif annotation is float:
        return "number"
    elif get_origin(annotation) is list:
        return "array"
    elif get_origin(annotation) is dict:
        return "object"
    else:
        return "string"  # Default fallback


def convert_tool_to_schema(tool_class: Type[BaseTool]) -> Dict[str, Any]:
    """Convert tool class to LangChain tool schema."""
    return {
        "type": "function",
        "function": {
            "name": tool_class.__name__,
            "description": tool_class.__doc__ or f"Execute {tool_class.__name__}",
            "parameters": {
                "type": "object",
                "properties": {
                    field_name: {
                        "type": _pydantic_to_json_type(field_info.annotation),
                        "description": field_info.description or f"{field_name} parameter",
                    }
                    for field_name, field_info in tool_class.model_fields.items()
                },
                "required": [name for name, field in tool_class.model_fields.items() if field.is_required()],
            },
        },
    }


def convert_tools_to_schemas(tools: Dict[str, Type[BaseTool]]) -> List[Dict[str, Any]]:
    """Convert tools dict to list of schemas."""
    return [convert_tool_to_schema(tool_class) for tool_class in tools.values()]
