import { ALUMNIUM_BIN_VERSION, CliCommand } from "@alumnium/core/internal";
import { setupEmbeddedDependencies } from "@alumnium/mcp/standalone";

// Don't use logger here, so it can be configured by commands before any
// log is emitted. It allows to avoid re-configuration complexity when using
// `getLogger` in module scope.

await main();

async function main() {
  await setupEmbeddedDependencies();

  const [{ InstallCommand, McpCommand }, { ServerCommand }, { CacheCommand }] =
    await Promise.all([
      import("@alumnium/mcp"),
      import("@alumnium/server"),
      import("./CacheCommand.ts"),
    ]);

  const COMMANDS = [InstallCommand, ServerCommand, McpCommand, CacheCommand];

  CliCommand.parse({
    name: "alumnium",
    version: ALUMNIUM_BIN_VERSION,
    commands: COMMANDS,
    args: Bun.argv.slice(2),
  });
}
