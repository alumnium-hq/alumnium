from alumnium.tools import PressKeyTool, TypeTool, UploadTool
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


def test_convert_tool_with_array():
    schema = convert_tool_to_schema(UploadTool)
    assert schema == {
        "type": "function",
        "function": {
            "name": "UploadTool",
            "description": (
                "Upload one or more files using a button that opens a file chooser. "
                "This tool automatically clicks the button, DO NOT use ClickTool for that."
            ),
            "parameters": {
                "type": "object",
                "properties": {
                    "id": {
                        "type": "integer",
                        "description": "Element identifier (ID)",
                    },
                    "paths": {
                        "type": "array",
                        "items": {
                            "type": "string",
                        },
                        "description": (
                            "Absolute file path(s) to upload. "
                            "Can be a single path or multiple paths for multi-file upload."
                        ),
                    },
                },
                "required": ["id", "paths"],
            },
        },
    }
