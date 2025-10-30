"""MCP Server for Alumnium - exposes browser automation capabilities to AI coding agents."""

import asyncio
import json
import os
import uuid
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool

from alumnium import Alumni, Model
from alumnium.area import Area

# Global state for driver management
_drivers: dict[str, tuple[Alumni, Any]] = {}  # driver_id -> (Alumni instance, raw driver)
_areas: dict[str, Area] = {}  # area_id -> Area instance


class AlumniumMCPServer:
    """MCP Server that wraps Alumnium functionality for AI agents."""

    def __init__(self):
        self.server = Server("alumnium")
        self._setup_handlers()

    def _setup_handlers(self):
        """Register all MCP handlers."""

        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            """List all available Alumnium tools."""
            return [
                Tool(
                    name="start_driver",
                    description=(
                        "Initialize a browser driver for automated testing. "
                        "Returns a driver_id for use in other calls."
                    ),
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "capabilities": {
                                "type": "string",
                                "description": (
                                    "JSON string with Selenium/Appium capabilities. "
                                    "Must include 'platformName' (e.g., 'chrome', 'iOS', 'Android'). "
                                    'Example: \'{"platformName": "iOS", '
                                    '"appium:deviceName": "iPhone 16", '
                                    '"appium:platformVersion": "18.0"}\''
                                ),
                            },
                            "url": {
                                "type": "string",
                                "description": "Optional initial URL to navigate to",
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
                    description="Execute a goal using natural language (e.g., 'click login button', 'fill out the form'). Alumnium will plan and execute the necessary steps.",
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
                    description="Verify a statement is true about the current page. Raises error if false. Returns explanation.",
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
                    description="Extract data from the page (e.g., 'user name', 'product prices', 'item count'). Returns the extracted data.",
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
                    name="area",
                    description="Create a scoped area for focused operations (e.g., 'navigation sidebar', 'product grid'). Returns area_id for use with area_* tools.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "driver_id": {"type": "string"},
                            "description": {
                                "type": "string",
                                "description": "Description of the area to scope to",
                            },
                        },
                        "required": ["driver_id", "description"],
                    },
                ),
                Tool(
                    name="area_do",
                    description="Execute a goal within a scoped area. Same as alumnium_do but limited to the specified area.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "area_id": {
                                "type": "string",
                                "description": "Area ID from alumnium_area",
                            },
                            "goal": {"type": "string"},
                        },
                        "required": ["area_id", "goal"],
                    },
                ),
                Tool(
                    name="area_check",
                    description="Verify a statement within a scoped area.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "area_id": {"type": "string"},
                            "statement": {"type": "string"},
                            "vision": {"type": "boolean", "default": False},
                        },
                        "required": ["area_id", "statement"],
                    },
                ),
                Tool(
                    name="area_get",
                    description="Extract data from a scoped area.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "area_id": {"type": "string"},
                            "data": {"type": "string"},
                            "vision": {"type": "boolean", "default": False},
                        },
                        "required": ["area_id", "data"],
                    },
                ),
                Tool(
                    name="get_accessibility_tree",
                    description="Get structured representation of current page for debugging. Useful for understanding page structure.",
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
                    description="Save the Alumnium cache for a driver session. This persists learned interactions for future use.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "driver_id": {"type": "string"},
                        },
                        "required": ["driver_id"],
                    },
                ),
            ]

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict[str, Any]) -> list[Any]:
            """Handle tool execution."""
            try:
                if name == "start_driver":
                    return await self._start_driver(arguments)
                elif name == "do":
                    return await self._alumnium_do(arguments)
                elif name == "check":
                    return await self._alumnium_check(arguments)
                elif name == "get":
                    return await self._alumnium_get(arguments)
                elif name == "area":
                    return await self._alumnium_area(arguments)
                elif name == "area_do":
                    return await self._area_do(arguments)
                elif name == "area_check":
                    return await self._area_check(arguments)
                elif name == "area_get":
                    return await self._area_get(arguments)
                elif name == "get_accessibility_tree":
                    return await self._get_accessibility_tree(arguments)
                elif name == "quit_driver":
                    return await self._quit_driver(arguments)
                elif name == "save_cache":
                    return await self._save_cache(arguments)
                else:
                    raise ValueError(f"Unknown tool: {name}")
            except Exception as e:
                return [{"type": "text", "text": f"Error: {str(e)}"}]

    async def _start_driver(self, args: dict[str, Any]) -> list[dict]:
        """Start a new driver instance."""
        # Parse capabilities JSON
        try:
            capabilities = json.loads(args["capabilities"])
        except json.JSONDecodeError as e:
            raise ValueError(f"Invalid JSON in capabilities parameter: {e}")

        # Extract and validate platformName
        if "platformName" not in capabilities:
            raise ValueError("capabilities must include 'platformName' field")

        platform_name = capabilities["platformName"].lower()
        url = args.get("url")
        server_url = args.get("server_url")

        # Detect platform and create appropriate driver
        if platform_name in ["chrome", "chromium"]:
            driver = self._create_chromium_driver(capabilities, url, server_url)
            platform_label = "Chromium"
        elif platform_name == "ios":
            driver = self._create_ios_driver(capabilities, url, server_url)
            platform_label = "iOS"
        elif platform_name == "android":
            driver = self._create_android_driver(capabilities, url, server_url)
            platform_label = "Android"
        else:
            raise ValueError(
                f"Unsupported platformName: {platform_name}. Supported values: chrome, chromium, ios, android"
            )

        # Create Alumni instance with model from environment
        model = Model.current  # Will use ALUMNIUM_MODEL env var or default
        al = Alumni(driver, model=model)

        # Generate unique driver ID
        driver_id = str(uuid.uuid4())
        _drivers[driver_id] = (al, driver)

        return [
            {
                "type": "text",
                "text": (
                    f"Driver started successfully. driver_id: {driver_id}\n"
                    f"Platform: {platform_label}\n"
                    f"Model: {model.provider.value}/{model.name}"
                ),
            }
        ]

    def _create_chromium_driver(self, capabilities: dict[str, Any], url: str | None, server_url: str | None) -> Any:
        """Create Selenium Chrome driver from capabilities."""
        from selenium.webdriver.chrome.options import Options

        options = Options()

        # Apply all capabilities to options
        for key, value in capabilities.items():
            if key != "platformName":
                options.set_capability(key, value)

        # Use Remote driver if server_url provided, otherwise local Chrome
        if server_url:
            from selenium.webdriver import Remote

            driver = Remote(command_executor=server_url, options=options)
        else:
            from selenium.webdriver import Chrome

            driver = Chrome(options=options)

        if url:
            driver.get(url)
        return driver

    def _create_ios_driver(self, capabilities: dict[str, Any], url: str | None, server_url: str | None) -> Any:
        """Create Appium iOS driver from capabilities."""
        from appium.options.ios import XCUITestOptions
        from appium.webdriver.client_config import AppiumClientConfig
        from appium.webdriver.webdriver import WebDriver as Appium

        options = XCUITestOptions()

        # Load capabilities into options
        options.load_capabilities(capabilities)

        # Handle url parameter as app path if provided
        if url:
            options.app = url.replace("file://", "")

        # Determine server URL: parameter > env var > default
        if server_url:
            remote_server = server_url
        else:
            remote_server = os.getenv("ALUMNIUM_APPIUM_SERVER", "http://localhost:4723")

        # Set up Appium client config
        client_config = AppiumClientConfig(
            username=os.getenv("LT_USERNAME"),
            password=os.getenv("LT_ACCESS_KEY"),
            remote_server_addr=remote_server,
            direct_connection=True,
        )

        # Create Appium driver
        return Appium(client_config=client_config, options=options)

    def _create_android_driver(self, capabilities: dict[str, Any], url: str | None, server_url: str | None) -> Any:
        """Create Appium Android driver from capabilities."""
        from appium.options.android import UiAutomator2Options
        from appium.webdriver.client_config import AppiumClientConfig
        from appium.webdriver.webdriver import WebDriver as Appium

        options = UiAutomator2Options()

        # Load capabilities into options
        options.load_capabilities(capabilities)

        # Handle url parameter as app path if provided
        if url:
            options.app = url.replace("file://", "")

        # Determine server URL: parameter > env var > default
        if server_url:
            remote_server = server_url
        else:
            remote_server = os.getenv("ALUMNIUM_APPIUM_SERVER", "http://localhost:4723")

        # Set up Appium client config
        client_config = AppiumClientConfig(
            username=os.getenv("LT_USERNAME"),
            password=os.getenv("LT_ACCESS_KEY"),
            remote_server_addr=remote_server,
            direct_connection=True,
        )

        # Create Appium driver
        return Appium(client_config=client_config, options=options)

    async def _alumnium_do(self, args: dict[str, Any]) -> list[dict]:
        """Execute Alumni.do()."""
        driver_id = args["driver_id"]
        goal = args["goal"]

        if driver_id not in _drivers:
            raise ValueError(f"Driver {driver_id} not found. Call alumnium_start_driver first.")

        al, _ = _drivers[driver_id]
        al.do(goal)

        return [{"type": "text", "text": f"Successfully executed: {goal}"}]

    async def _alumnium_check(self, args: dict[str, Any]) -> list[dict]:
        """Execute Alumni.check()."""
        driver_id = args["driver_id"]
        statement = args["statement"]
        vision = args.get("vision", False)

        if driver_id not in _drivers:
            raise ValueError(f"Driver {driver_id} not found.")

        al, _ = _drivers[driver_id]
        try:
            explanation = al.check(statement, vision=vision)
            result = True
        except AssertionError as e:
            explanation = str(e)
            result = False

        return [{"type": "text", "text": f"Check finished: {statement}\nResult: {result}\nExplanation: {explanation}"}]

    async def _alumnium_get(self, args: dict[str, Any]) -> list[dict]:
        """Execute Alumni.get()."""
        driver_id = args["driver_id"]
        data = args["data"]
        vision = args.get("vision", False)

        if driver_id not in _drivers:
            raise ValueError(f"Driver {driver_id} not found.")

        al, _ = _drivers[driver_id]
        result = al.get(data, vision=vision)

        return [{"type": "text", "text": f"Extracted data: {result}"}]

    async def _alumnium_area(self, args: dict[str, Any]) -> list[dict]:
        """Create a scoped area."""
        driver_id = args["driver_id"]
        description = args["description"]

        if driver_id not in _drivers:
            raise ValueError(f"Driver {driver_id} not found.")

        al, _ = _drivers[driver_id]
        area = al.area(description)

        area_id = str(uuid.uuid4())
        _areas[area_id] = area

        return [{"type": "text", "text": f"Area created successfully. area_id: {area_id}\nDescription: {description}"}]

    async def _area_do(self, args: dict[str, Any]) -> list[dict]:
        """Execute Area.do()."""
        area_id = args["area_id"]
        goal = args["goal"]

        if area_id not in _areas:
            raise ValueError(f"Area {area_id} not found. Call alumnium_area first.")

        area = _areas[area_id]
        area.do(goal)

        return [{"type": "text", "text": f"Successfully executed in area: {goal}"}]

    async def _area_check(self, args: dict[str, Any]) -> list[dict]:
        """Execute Area.check()."""
        area_id = args["area_id"]
        statement = args["statement"]
        vision = args.get("vision", False)

        if area_id not in _areas:
            raise ValueError(f"Area {area_id} not found.")

        area = _areas[area_id]
        explanation = area.check(statement, vision=vision)

        return [{"type": "text", "text": f"Check passed: {statement}\nExplanation: {explanation}"}]

    async def _area_get(self, args: dict[str, Any]) -> list[dict]:
        """Execute Area.get()."""
        area_id = args["area_id"]
        data = args["data"]
        vision = args.get("vision", False)

        if area_id not in _areas:
            raise ValueError(f"Area {area_id} not found.")

        area = _areas[area_id]
        result = area.get(data, vision=vision)

        return [{"type": "text", "text": f"Extracted data: {result}"}]

    async def _get_accessibility_tree(self, args: dict[str, Any]) -> list[dict]:
        """Get accessibility tree for debugging."""
        driver_id = args["driver_id"]

        if driver_id not in _drivers:
            raise ValueError(f"Driver {driver_id} not found.")

        al, _ = _drivers[driver_id]
        # Access the internal driver's accessibility tree
        tree = str(al.driver.accessibility_tree.to_str())

        return [{"type": "text", "text": f"Accessibility Tree:\n{tree}"}]

    async def _quit_driver(self, args: dict[str, Any]) -> list[dict]:
        """Quit driver and cleanup."""
        driver_id = args["driver_id"]

        if driver_id not in _drivers:
            raise ValueError(f"Driver {driver_id} not found.")

        al, driver = _drivers[driver_id]
        al.quit()
        driver.quit()

        # Clean up areas associated with this driver
        areas_to_remove = [area_id for area_id, area in _areas.items() if area.driver == al.driver]
        for area_id in areas_to_remove:
            del _areas[area_id]

        del _drivers[driver_id]

        return [{"type": "text", "text": f"Driver {driver_id} closed successfully"}]

    async def _save_cache(self, args: dict[str, Any]) -> list[dict]:
        """Save the cache for a driver session."""
        driver_id = args["driver_id"]

        if driver_id not in _drivers:
            raise ValueError(f"Driver {driver_id} not found.")

        al, _ = _drivers[driver_id]
        al.cache.save()

        return [{"type": "text", "text": f"Cache saved successfully for driver {driver_id}"}]

    async def run(self):
        """Run the MCP server using stdio transport."""
        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(read_stream, write_stream, self.server.create_initialization_options())


def main():
    """Entry point for the MCP server."""
    # Ensure Haiku model is used by default if not specified
    if "ALUMNIUM_MODEL" not in os.environ:
        os.environ["ALUMNIUM_MODEL"] = "anthropic/claude-haiku-4-5-20251001"

    server = AlumniumMCPServer()
    asyncio.run(server.run())


if __name__ == "__main__":
    main()
