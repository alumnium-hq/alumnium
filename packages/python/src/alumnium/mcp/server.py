"""MCP Server for Alumnium - exposes browser automation capabilities to AI coding agents."""

import asyncio
from typing import Any

from mcp.server import Server as MCPServer
from mcp.server.stdio import stdio_server
from mcp.types import Tool

from ..server.logutils import get_logger
from . import handlers, tools

logger = get_logger(__name__)


class Server:
    """MCP Server that wraps Alumnium functionality for AI agents."""

    def __init__(self):
        self.server = MCPServer("alumnium")
        self._setup_handlers()
        logger.info("Server initialized")

    def _setup_handlers(self):
        """Register all MCP handlers."""

        @self.server.list_tools()
        async def list_tools() -> list[Tool]:
            """List all available Alumnium tools."""
            return tools.get_tool_definitions()

        @self.server.call_tool()
        async def call_tool(name: str, arguments: dict[str, Any]) -> list[Any]:
            """Handle tool execution."""
            logger.debug(f"MCP tool called: {name}")
            try:
                if name == "start_driver":
                    return await handlers.handle_start_driver(arguments)
                elif name == "do":
                    return await handlers.handle_do(arguments)
                elif name == "check":
                    return await handlers.handle_check(arguments)
                elif name == "get":
                    return await handlers.handle_get(arguments)
                elif name == "fetch_accessibility_tree":
                    return await handlers.handle_fetch_accessibility_tree(arguments)
                elif name == "list_tabs":
                    return await handlers.handle_list_tabs(arguments)
                elif name == "switch_tab":
                    return await handlers.handle_switch_tab(arguments)
                elif name == "wait":
                    return await handlers.handle_wait(arguments)
                elif name == "wait_for_element":
                    return await handlers.handle_wait_for_element(arguments)
                elif name == "stop_driver":
                    return await handlers.handle_stop_driver(arguments)
                else:
                    logger.error(f"Unknown tool called: {name}")
                    raise ValueError(f"Unknown tool: {name}")
            except Exception as e:
                logger.error(f"Error executing tool {name}: {e}", exc_info=True)
                return [{"type": "text", "text": f"Error: {str(e)}"}]

    async def run(self):
        """Run the MCP server using stdio transport."""
        logger.info("Starting MCP server with stdio transport")
        async with stdio_server() as (read_stream, write_stream):
            await self.server.run(read_stream, write_stream, self.server.create_initialization_options())


def main():
    """Entry point for the MCP server."""
    server = Server()
    asyncio.run(server.run())


if __name__ == "__main__":
    main()
