import type z from "zod";
import { PlaywrightDriver } from "@alumnium/playwright";
import { Env, Logger, Tracer } from "@alumnium/core/internal";
import { McpState } from "../../mcp/McpState.ts";
import { checkMcpTool } from "../../mcp/tools/checkMcpTool.ts";
import { doMcpTool } from "../../mcp/tools/doMcpTool.ts";
import { fetchAccessibilityTreeMcpTool } from "../../mcp/tools/fetchAccessibilityTreeMcpTool.ts";
import { getMcpTool } from "../../mcp/tools/getMcpTool.ts";
import type { McpTool } from "../../mcp/tools/McpTool.ts";
import { startMcpTool } from "../../mcp/tools/startMcpTool.ts";
import { stopMcpTool } from "../../mcp/tools/stopMcpTool.ts";
import { waitMcpTool } from "../../mcp/tools/waitMcpTool.ts";
import { CliSessionDaemon } from "./CliSessionDaemon.ts";
import { CliSessionRegistry } from "./CliSessionRegistry.ts";

const logger = Logger.get(import.meta.url);

export namespace runCliDaemon {
  export interface Props {
    session: string;
    capabilities: string;
    serverUrl?: string | undefined;
    logFilenameHint: string;
  }
}

/**
 * Runs the session daemon in the current process. Invoked by
 * `alumnium cli start` when `ALUMNIUM_CLI_DAEMONIZE` is set. Its stdout and
 * stderr go to the session log file, `start` polls the registry for readiness.
 */
export async function runCliDaemon(props: runCliDaemon.Props): Promise<void> {
  const { session, capabilities, serverUrl, logFilenameHint } = props;

  // NOTE: Must happen before anything logs, see the NOTE in bin.ts.
  Logger.path = { filename: `cli-daemon-${session}-${logFilenameHint}` };
  await Logger.initEnv({ logger });

  const registry = new CliSessionRegistry();
  const stop = cliTool(stopMcpTool);

  const daemon = new CliSessionDaemon({
    session,
    registry,
    start: cliTool(startMcpTool),
    startInput: { capabilities, server_url: serverUrl },
    stop,
    tools: {
      check: cliTool(checkMcpTool),
      do: cliTool(doMcpTool),
      fetch_accessibility_tree: cliTool(fetchAccessibilityTreeMcpTool),
      get: cliTool(getMcpTool),
      wait: cliTool(waitMcpTool),
    },
    idleTimeoutMs: Env.ALUMNIUM_CLI_IDLE_TIMEOUT * 1000,
    onExit: exit,
  });

  // NOTE: Removes only the files this daemon owns, see the method.
  process.on("exit", () => daemon.removeOwnedFilesSync());

  // NOTE: Node exits on SIGTERM without emitting `exit`. The client kills a
  // daemon that missed its start deadline this way, and so does `kill <pid>`.
  // Not delivered on Windows, where `kill()` terminates the process outright.
  //
  // NOTE: Before `start` finishes, `terminate` would race the rest of it, so
  // stop the driver directly and never wait for `start`, it may be hung.
  let started = false;
  let aborting = false;
  process.once("SIGTERM", async () => {
    if (started) {
      void daemon.terminate(true);
      return;
    }
    aborting = true;
    if (daemon.driverId) await stop({ id: daemon.driverId }).catch(() => {});
    await exit(143);
  });

  try {
    await daemon.start();

    const { driver } = McpState.getDriverAlumni(daemon.driverId);
    if (driver instanceof PlaywrightDriver)
      driver.page.context().on("close", () => void daemon.terminate(false));
    started = true;
  } catch (error) {
    // NOTE: The SIGTERM handler owns the exit, `start` failed because of it.
    if (aborting) return;
    logger.error("Failed to start session: {error}", { error });
    // NOTE: Goes to the session log file, `start` prints it on failure.
    console.error(error instanceof Error ? error.message : String(error));
    await exit(1);
  }
}

function cliTool<Input extends z.ZodObject>(
  tool: McpTool.Definition<string, Input>,
): CliSessionDaemon.Tool {
  return (input) => tool.execute(tool.inputSchema.parse(input));
}

async function exit(code: number) {
  // NOTE: The tracer only flushes on `beforeExit`, which `process.exit` skips.
  await Tracer.flush();
  process.exit(code);
}
