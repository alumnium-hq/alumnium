import { setLogPath } from "../utils/logger.js";
import { McpServer } from "./McpServer.js";

export async function mcpCommand(logFilename: string) {
  setLogPath({ filename: logFilename });

  const server = new McpServer();
  await server.run();
}
