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
                            "You can optionally set cookies. "
                            'Example: \'{"cookies": [{"name": "session", "value": "abc123", '
                            '"domain": ".example.com"}]}\'.'
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
            name="stop_driver",
            description="Close browser/app and cleanup driver resources.",
            inputSchema={
                "type": "object",
                "properties": {
                    "driver_id": {"type": "string"},
                    "save_cache": {
                        "type": "boolean",
                        "description": (
                            "Save the Alumnium cache before stopping. "
                            "This persists executed interactions for future use."
                        ),
                        "default": False,
                    },
                },
                "required": ["driver_id"],
            },
        ),
        Tool(
            name="do",
            description=(
                "Execute a goal using natural language (e.g., 'click login button', 'fill out the form'). "
                "Alumnium will plan and execute the necessary steps."
            ),
            inputSchema={
                "type": "object",
                "properties": {
                    "driver_id": {
                        "type": "string",
                        "description": "Driver ID from start_driver",
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
                "Extract data from the page (e.g., 'user name', 'product prices', 'item count'). "
                "Returns the extracted data if it's available or explanation why it can't be extracted."
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
            name="fetch_accessibility_tree",
            description=(
                "Get structured representation of current page for debugging. "
                "Useful for understanding page structure or debugging."
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
