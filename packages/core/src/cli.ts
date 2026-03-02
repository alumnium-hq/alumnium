import { parseArgs } from "node:util";
import z from "zod";
import { mcpCommand } from "./mcp/mcpCommand.js";
import { serverCommand } from "./server/serverCommand.js";
import { getLogger } from "./utils/logger.js";

const logger = getLogger(import.meta.url);

const Command = z.union([z.literal("mcp"), z.literal("server")]);

type Command = z.infer<typeof Command>;

const {
  positionals: [_, __, commandArg, ...restArgs],
} = parseArgs({
  args: Bun.argv,
  allowPositionals: true,
  strict: false,
});

let command: Command;
try {
  command = Command.parse(commandArg);
} catch {
  logger.error(`Incorrect command, use one of: mcp, server`);
  process.exit(1);
}

switch (command) {
  case "mcp":
    mcpCommand();
    break;

  case "server":
    serverCommand();
    break;

  default:
    command satisfies never;
}
