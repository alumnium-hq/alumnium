from enum import Enum
from typing import Any, get_args, get_origin

from ..server.logutils import get_logger
from .base_tool import BaseTool

logger = get_logger(__name__)


def _pydantic_to_json_type(annotation: type | None) -> dict[str, Any]:
    """Convert Pydantic field type to JSON schema type."""
    if annotation is None:
        return {"type": "string"}  # Default for missing annotation

    # Check if it's an Enum
    try:
        if isinstance(annotation, type) and issubclass(annotation, Enum):
            # Extract enum values
            enum_values = [member.value for member in annotation]
            return {"type": "string", "enum": enum_values}
    except TypeError:
        # issubclass raises TypeError for non-class types
        pass

    origin = get_origin(annotation)

    if annotation is int:
        return {"type": "integer"}
    elif annotation is str:
        return {"type": "string"}
    elif annotation is bool:
        return {"type": "boolean"}
    elif annotation is float:
        return {"type": "number"}
    elif origin is list:
        # Get the element type from list[T] or fallback to string
        args = get_args(annotation)
        if args:
            item_type = _pydantic_to_json_type(args[0])
        else:
            item_type = {"type": "string"}
        return {"type": "array", "items": item_type}
    elif origin is dict:
        return {"type": "object"}
    else:
        return {"type": "string"}  # Default fallback


def convert_tool_to_schema(tool_class: type[BaseTool]) -> dict[str, Any]:
    """Convert tool class to LangChain tool schema."""
    logger.debug(f"- {tool_class.__name__} ({tool_class.__doc__})")
    return {
        "type": "function",
        "function": {
            "name": tool_class.__name__,
            "description": tool_class.__doc__ or f"Execute {tool_class.__name__}",
            "parameters": {
                "type": "object",
                "properties": {
                    field_name: {
                        **_pydantic_to_json_type(field_info.annotation),
                        "description": field_info.description or f"{field_name} parameter",
                    }
                    for field_name, field_info in tool_class.model_fields.items()
                },
                "required": [name for name, field in tool_class.model_fields.items() if field.is_required()],
            },
        },
    }


def convert_tools_to_schemas(tools: dict[str, type[BaseTool]]) -> list[dict[str, Any]]:
    """Convert tools dict to list of schemas."""
    logger.debug("Converting tools to schemas:")
    return [convert_tool_to_schema(tool_class) for tool_class in tools.values()]
