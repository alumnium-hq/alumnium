import z from "zod";
import { CliCommand } from "../cli/CliCommand.ts";
import { Logger } from "../telemetry/Logger.ts";
import { McpServer } from "./McpServer.ts";

const logger = Logger.get(import.meta.url);

export namespace McpCommand {}

export const McpCommand = CliCommand.define({
  name: "mcp",
  description: "Run MCP server",

  Options: z.object({}),

  action: async ({ logFilenameHint }) => {
    Logger.path = { filename: logFilenameHint };
    await Logger.initEnv(logger);

    const server = new McpServer();
    await server.run();
  },
});
