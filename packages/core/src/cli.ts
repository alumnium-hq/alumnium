import { parseArgs } from "node:util";
import z from "zod";
import { FileStore } from "./FileStore/FileStore.js";
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

const logTimeStr = new Date().toISOString().slice(0, 19);
const logFilename =
  process.env.ALUMNIUM_LOG_FILENAME || `${command}-${logTimeStr}.log`;
const logPath =
  process.env.ALUMNIUM_LOG_PATH ||
  FileStore.globalSubDir(`logs/${logFilename}`);

switch (command) {
  case "mcp":
    await mcpCommand(logPath);
    break;

  case "server":
    await serverCommand(logPath);
    break;

  default:
    command satisfies never;
}
