"""MCP Server for Alumnium - exposes browser automation capabilities to AI coding agents."""

import asyncio
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
                    description="Initialize a browser driver for automated testing. Returns a driver_id for use in other calls.",
                    inputSchema={
                        "type": "object",
                        "properties": {
                            "platform": {
                                "type": "string",
                                "enum": ["chromium", "android", "ios"],
                                "description": "Target platform for automation",
                            },
                            "url": {
                                "type": "string",
                                "description": "Optional initial URL to navigate to",
                            },
                        },
                        "required": ["platform"],
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
        platform = args["platform"]
        url = args.get("url")

        # Create appropriate driver based on platform
        if platform == "chromium":
            from selenium.webdriver import Chrome
            from selenium.webdriver.chrome.options import Options

            options = Options()
            driver = Chrome(options=options)
            if url:
                driver.get(url)
        elif platform == "ios":
            from appium.options.ios import XCUITestOptions
            from appium.webdriver.client_config import AppiumClientConfig
            from appium.webdriver.webdriver import WebDriver as Appium

            # Set up iOS/XCUITest options
            options = XCUITestOptions()
            options.automation_name = "XCUITest"
            options.platform_name = "iOS"
            options.device_name = os.getenv("ALUMNIUM_IOS_DEVICE_NAME", "iPhone 16")
            options.platform_version = os.getenv("ALUMNIUM_IOS_PLATFORM_VERSION", "18.4")
            options.new_command_timeout = 300
            options.wda_launch_timeout = 90_000  # ms

            # Use url parameter as app path
            if url:
                options.app = url.replace("file://", "")
            else:
                # If no app path provided, use Safari browser
                options.bundle_id = "com.apple.mobilesafari"

            # Set up Appium client config
            appium_server = os.getenv("ALUMNIUM_APPIUM_SERVER", "http://localhost:4723")
            client_config = AppiumClientConfig(
                remote_server_addr=appium_server,
                direct_connection=True,
            )

            # Create Appium driver
            driver = Appium(client_config=client_config, options=options)
        elif platform == "android":
            raise NotImplementedError(f"Platform {platform} requires Appium setup. Not yet implemented.")
        else:
            raise ValueError(f"Unsupported platform: {platform}")

        # Create Alumni instance with model from environment
        model = Model.current  # Will use ALUMNIUM_MODEL env var or default
        al = Alumni(driver, model=model)

        # Generate unique driver ID
        driver_id = str(uuid.uuid4())
        _drivers[driver_id] = (al, driver)

        return [
            {
                "type": "text",
                "text": f"Driver started successfully. driver_id: {driver_id}\nPlatform: {platform}\nModel: {model.provider.value}/{model.name}",
            }
        ]

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
