import { cac } from "cac";
import * as ansi from "picocolors";
import { ALUMNIUM_VERSION } from "../package.ts";
import { setupEmbeddedDependencies } from "../standalone/setupEmbeddedDependencies.ts";

await main();

async function main() {
  await setupEmbeddedDependencies();

  const [{ McpCommand }, { ServerCommand }] = await Promise.all([
    import("../mcp/McpCommand.ts"),
    import("../server/ServerCommand.ts"),
  ]);

  const COMMANDS = [ServerCommand, McpCommand];
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
