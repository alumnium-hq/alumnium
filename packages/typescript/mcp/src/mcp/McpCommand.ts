import z from "zod";
import { CliCommand, Env, Logger, McpMode } from "@alumnium/core/internal";
import { McpServer } from "./McpServer.ts";
import { McpTransport } from "./McpTransport.ts";

const logger = Logger.get(import.meta.url);

export namespace McpCommand {}

export const McpCommand = CliCommand.define({
  name: "mcp",
  description: "Run MCP server",

  Args: z.object({
    transport: McpTransport.default("stdio").register(CliCommand.option, {
      name: "transport",
      syntax: "--transport <transport>",
      description: "Transport: stdio or http",
    }),

    host: z.string().default(Env.ALUMNIUM_HOST).register(CliCommand.option, {
      name: "host",
      syntax: "--host <host>",
      description:
        "Host to bind to for HTTP transport (defaults to ALUMNIUM_HOST or 127.0.0.1)",
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

    mode: McpMode.default(Env.ALUMNIUM_MCP_MODE).register(CliCommand.option, {
      name: "mode",
      syntax: "--mode <mode>",
      description:
        "Execution mode: agentic or direct (defaults to ALUMNIUM_MCP_MODE or agentic). HTTP clients can override it per request with ?mode=agentic|direct",
    }),
  }),

  action: async ({ args, logFilenameHint }) => {
    Logger.path = { filename: logFilenameHint };
    await Logger.initEnv({ logger });

    const server = new McpServer(args);
    await server.run();
  },
});
