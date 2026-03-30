import { parseArgs } from "node:util";
import z from "zod";
import { mcpCommand } from "./mcp/mcpCommand.js";
import { serverCommand } from "./server/serverCommand.js";
import { getLogger } from "./utils/logger.js";

const logger = getLogger(import.meta.url);

const Command = z.union([z.literal("mcp"), z.literal("server")]);

type Command = z.infer<typeof Command>;

const {
  positionals: [_, __, commandArg],
} = parseArgs({
  args: Bun.argv,
  allowPositionals: true,
  strict: false,
});

let command: Command;
try {
  command = Command.parse(commandArg);
} catch {
  logger.error(`Incorrect '${commandArg}' command, use one of: mcp, server`);
  process.exit(1);
}

// NOTE: Log path can be overridden via env vars, see utils/logger.ts.
// Also commands themselves decide if to use console or file logging, i.e.,
// MCP and server in daemon mode will to file automatically.
const logTimeStr = new Date().toISOString().slice(0, 19);
const logFilenameHint = `${command}-${logTimeStr}.log`;

switch (command) {
  case "mcp":
    await mcpCommand(logFilenameHint);
    break;

  case "server":
    await serverCommand(logFilenameHint);
    break;

  default:
    command satisfies never;
}
