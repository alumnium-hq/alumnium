import z from "zod";
import { CliCommand } from "../cli/CliCommand.ts";
import { Logger } from "../telemetry/Logger.ts";
import { McpServer } from "./McpServer.ts";

export namespace McpCommand {}

export const McpCommand = CliCommand.define({
  name: "mcp",
  description: "Run MCP server",

  Args: z.object({}),

  action: async ({ logFilenameHint }) => {
    Logger.path = { filename: logFilenameHint };

    const server = new McpServer();
    await server.run();
  },
});
