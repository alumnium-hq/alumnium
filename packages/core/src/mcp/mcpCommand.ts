import { getLogger } from "../utils/logger.js";
import { McpServer } from "./McpServer.js";

const logger = getLogger(import.meta.url);

export async function mcpCommand() {
  const server = new McpServer();
  await void server.run();
  logger.debug("Started MCP server");
}
