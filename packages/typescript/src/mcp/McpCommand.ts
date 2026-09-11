import z from "zod";
import { CliCommand } from "../cli/CliCommand.ts";
import { Env } from "../Env.ts";
import { McpMode } from "./McpMode.ts";
import { Logger } from "../telemetry/Logger.ts";
import { McpServer } from "./McpServer.ts";

const logger = Logger.get(import.meta.url);

export namespace McpCommand {}

export const McpCommand = CliCommand.define({
  name: "mcp",
  description: "Run MCP server",

  Args: z.object({
    mode: McpMode.optional().register(CliCommand.option, {
      name: "mode",
      syntax: "--mode <mode>",
      description:
        "Execution mode: agentic or direct (defaults to ALUMNIUM_MCP_MODE or agentic)",
    }),
  }),

  action: async ({ args, logFilenameHint }) => {
    Logger.path = { filename: logFilenameHint };
    await Logger.initEnv(logger);

    const server = new McpServer({ mode: args.mode ?? Env.ALUMNIUM_MCP_MODE });
    await server.run();
  },
});
