"""MCP Server for Alumnium - exposes browser automation capabilities to AI coding agents."""

import asyncio
from os import environ
from typing import Any

from mcp.server import Server
from mcp.server.stdio import stdio_server
from mcp.types import Tool

from ..server.logutils import get_logger
from . import handlers, tools

logger = get_logger(__name__)


class AlumniumMCPServer:
    """MCP Server that wraps Alumnium functionality for AI agents."""

    def __init__(self):
        self.server = Server("alumnium")
        self._setup_handlers()
        logger.info("AlumniumMCPServer initialized")

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
                elif name == "get_accessibility_tree":
                    return await handlers.handle_get_accessibility_tree(arguments)
                elif name == "quit_driver":
                    return await handlers.handle_quit_driver(arguments)
                elif name == "save_cache":
                    return await handlers.handle_save_cache(arguments)
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
    environ.setdefault("ALUMNIUM_MODEL", "anthropic/claude-haiku-4-5-20251001")  # Use Claude Haiku by default
    environ.setdefault("ALUMNIUM_PLAYWRIGHT_NEW_TAB_TIMEOUT", "2000")  # Sane for MCP
    server = AlumniumMCPServer()
    asyncio.run(server.run())


if __name__ == "__main__":
    main()
