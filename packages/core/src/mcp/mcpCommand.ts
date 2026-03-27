import { setLogPath } from "../utils/logger.js";
import { McpServer } from "./McpServer.js";

export async function mcpCommand(logPath: string) {
  setLogPath(logPath);

  const server = new McpServer();
  await server.run();
}
