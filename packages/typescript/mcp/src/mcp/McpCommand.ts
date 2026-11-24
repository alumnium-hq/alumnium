import z from "zod";
import { CliCommand, Logger } from "@alumnium/core/internal";
import { McpServer } from "./McpServer.ts";

const logger = Logger.get(import.meta.url);

export namespace McpCommand {}

export const McpCommand = CliCommand.define({
  name: "mcp",
  description: "Run MCP server",

  Args: z.object({
    transport: CliCommand.envOption("ALUMNIUM_MCP_TRANSPORT", {
      name: "transport",
      syntax: "--transport <transport>",
      description: "Transport: stdio or http",
    }),

    host: CliCommand.envOption("ALUMNIUM_HOST", {
      name: "host",
      syntax: "--host <host>",
      description: "Host to bind to for HTTP transport",
    }),

    port: z.coerce
      .number()
      .int()
      .min(1, "Port number must be >= 1")
      .max(65535, "Port number must be <= 65535")
      .default(8014)
      .register(CliCommand.option, {
        name: "port",
        syntax: "-p, --port <port>",
        description: "Port to bind to for HTTP transport",
      }),

    mode: CliCommand.envOption("ALUMNIUM_MCP_MODE", {
      name: "mode",
      syntax: "--mode <mode>",
      description:
        "Execution mode: agentic or direct. HTTP clients can override it per request with ?mode=agentic|direct",
    }),
  }),

  action: async ({ args, logFilenameHint }) => {
    if (args.transport === "stdio") {
      Logger.protectStdout();
      Logger.path = { filename: logFilenameHint };
    }
    await Logger.initEnv({ logger });

    const server = new McpServer(args);
    await server.run();
  },
});
