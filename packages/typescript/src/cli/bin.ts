import { cac } from "cac";
import * as ansi from "picocolors";
import { McpCommand } from "../mcp/McpCommand.js";
import { ALUMNIUM_VERSION } from "../package.js";
import { ServerCommand } from "../server/ServerCommand.js";

const COMMANDS = [ServerCommand, McpCommand];

await main();

async function main() {
  const cli = cac("alumnium");

  COMMANDS.forEach((command) => command.register(cli));

  cli.help();
  cli.version(ALUMNIUM_VERSION);

  cli.addEventListener("command:*", () => {
    const invalidCommand = cli.args[0];
    const commandNames = COMMANDS.map((command) => command.name).join(", ");
    console.error(
      `${ansi.red("Error:")} Incorrect '${invalidCommand}' command, use one of: ${commandNames}\n`,
    );
    console.log(`${ansi.blue("Help:")}\n`);
    cli.outputHelp();
    process.exit(1);
  });

  if (Bun.argv.length <= 2) {
    cli.outputHelp();
    process.exit(1);
  }

  cli.parse(Bun.argv);
}
