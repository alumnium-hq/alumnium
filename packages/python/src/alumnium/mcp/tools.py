"""Tool definitions for MCP server."""

from mcp.types import Tool


def get_tool_definitions() -> list[Tool]:
    """Get all available Alumnium MCP tool definitions."""
    return [
        Tool(
            name="start_driver",
            description=(
                "Initialize a browser driver for automated testing. Returns a driver_id for use in other calls."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "capabilities": {
                        "type": "string",
                        "description": (
                            "JSON string with Selenium/Appium/Playwright capabilities. "
                            "Must include 'platformName' (e.g., 'chrome', 'iOS', 'Android'). "
                            'Example: \'{"platformName": "iOS", '
                            '"appium:deviceName": "iPhone 16", '
                            '"appium:platformVersion": "18.0"}\'.'
                            "You can optionally set extra HTTP headers. "
                            'Example: \'{"headers": {"Authorization": "Bearer token"}}\'.'
                        ),
                    },
                    "server_url": {
                        "type": "string",
                        "description": (
                            "Optional remote Selenium/Appium server URL. "
                            "Examples: 'http://localhost:4723', "
                            "'https://mobile-hub.lambdatest.com/wd/hub'. "
                            "Defaults to local driver (Chrome) or localhost:4723 (Appium)"
                        ),
                    },
                },
                "required": ["capabilities"],
            },
        ),
        Tool(
            name="do",
            description=(
                "Execute actions for a goal using natural language "
                "(e.g., 'click login button', 'type text into search box'). "
                "Use concrete and explicit instructions without chaining multiple actions together. "
                "Returns the result and explanation."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "driver_id": {
                        "type": "string",
                        "description": "Driver ID from alumnium_start_driver",
                    },
                    "goal": {
                        "type": "string",
                        "description": "Natural language description of what to do",
                    },
                },
                "required": ["driver_id", "goal"],
            },
        ),
        Tool(
            name="check",
            description="Verify a statement is true about the current page. Returns the result and explanation.",
            inputSchema={
                "type": "object",
                "properties": {
                    "driver_id": {"type": "string"},
                    "statement": {
                        "type": "string",
                        "description": "Statement to verify (e.g., 'page title contains Dashboard')",
                    },
                    "vision": {
                        "type": "boolean",
                        "description": "Use screenshot for verification",
                        "default": False,
                    },
                },
                "required": ["driver_id", "statement"],
            },
        ),
        Tool(
            name="get",
            description=(
                "Extract data from the page "
                "(e.g., 'user name', 'product prices', 'item count'). "
                "Returns the extracted data and explanation."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "driver_id": {"type": "string"},
                    "data": {
                        "type": "string",
                        "description": "Description of data to extract",
                    },
                    "vision": {
                        "type": "boolean",
                        "description": "Use screenshot for extraction",
                        "default": False,
                    },
                },
                "required": ["driver_id", "data"],
            },
        ),
        Tool(
            name="describe",
            description=(
                "Get a detailed markdown description of the current page optimized for AI agents. "
                "This is the RECOMMENDED way to understand page state. Returns structured information about: "
                "page purpose, visible content (with specific titles/prices/ratings), interactive elements, "
                "navigation options, notable states, and possible actions. "
                "Use this to plan actions or for self-correction when needed."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "driver_id": {"type": "string"},
                    "vision": {
                        "type": "boolean",
                        "description": "Include screenshot analysis for visual context (uses more tokens)",
                        "default": False,
                    },
                },
                "required": ["driver_id"],
            },
        ),
        Tool(
            name="get_accessibility_tree",
            description=(
                "Get raw structured representation of current page for debugging. "
                "⚠️ ONLY use this when 'describe' is insufficient or for deep technical debugging. "
                "For understanding page state and planning actions, prefer 'describe' tool instead."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "driver_id": {"type": "string"},
                },
                "required": ["driver_id"],
            },
        ),
        Tool(
            name="quit_driver",
            description="Close browser/app and cleanup driver resources.",
            inputSchema={
                "type": "object",
                "properties": {
                    "driver_id": {"type": "string"},
                },
                "required": ["driver_id"],
            },
        ),
        Tool(
            name="save_cache",
            description=(
                "Save the Alumnium cache for a driver session. This persists learned interactions for future use."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "driver_id": {"type": "string"},
                },
                "required": ["driver_id"],
            },
        ),
    ]
