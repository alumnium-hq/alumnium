from alumnium.tools import PressKeyTool, TypeTool
from alumnium.tools.tool_to_schema_converter import convert_tool_to_schema


def test_convert_tool_with_primitives():
    assert convert_tool_to_schema(TypeTool) == {
        "type": "function",
        "function": {
            "name": "TypeTool",
            "description": "Type text into an element.",
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "integer",
                        "description": "Element identifier (ID)",
                    },
                    "text": {
                        "type": "string",
                        "description": "Text to type into an element",
                    },
                },
                "required": ["id", "text"],
            },
        },
    }


def test_convert_tool_with_enum():
    schema = convert_tool_to_schema(PressKeyTool)
    assert schema == {
        "type": "function",
        "function": {
            "name": "PressKeyTool",
            "description": "Press a keyboard key.",
            "parameters": {
                "type": "object",
                "properties": {
                    "key": {
                        "type": "string",
                        "enum": [
                            "Backspace",
                            "Enter",
                            "Escape",
                            "Tab",
                        ],
                        "description": "Key to press.",
                    }
                },
                "required": ["key"],
            },
        },
    }
