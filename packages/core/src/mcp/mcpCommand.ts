import { getLogger, setLoggerLevel } from "../utils/logger.js";
import { McpServer } from "./McpServer.js";

const logger = getLogger(import.meta.url);

export async function mcpCommand() {
  setLoggerLevel("error");
  const server = new McpServer();
  await server.run();
  logger.debug("Started MCP server");
}
