import { spawn } from "node:child_process";
import z from "zod";
import { Telemetry } from "@alumnium/core/internal";
import type { Recording } from "../Recording.ts";
import type { ToolExecutor } from "./ToolExecutor.ts";

const { logger } = Telemetry.get(import.meta.url);

const BASH_TOOL = "Bash";
const DEFAULT_TIMEOUT_MS = 120_000;

const BashInput = z.object({
  command: z.string(),
  /** Milliseconds, as the host agent's `Bash` tool takes it. */
  timeout: z.number().positive().optional(),
});

export namespace BashExecutor {
  export interface Props {
    allow: (string | RegExp)[];
    cwd?: string | undefined;
    env?: Record<string, string> | undefined;
    timeoutMs?: number | undefined;
  }
}

export class BashExecutor implements ToolExecutor {
  #props: BashExecutor.Props;

  constructor(props: BashExecutor.Props) {
    this.#props = props;
  }

  handles(call: ToolExecutor.Call): boolean {
    return !call.server && call.tool === BASH_TOOL;
  }

  async execute(call: ToolExecutor.Call): Promise<Recording.ToolResult> {
    const { command, timeout } = BashInput.parse(call.input);

    if (!this.#allows(command))
      throw new Error(`Command is not allowed to replay: ${command}`);

    logger.debug(`Running command: ${command}`);

    const { code, stdout, stderr } = await this.#run(command, {
      cwd: this.#props.cwd,
      // oxlint-disable-next-line node/no-process-env -- Commands inherit it
      env: { ...process.env, ...this.#props.env },
      timeoutMs: timeout ?? this.#props.timeoutMs ?? DEFAULT_TIMEOUT_MS,
    });

    // Only stdout on success, so that whatever a command logs to stderr does
    // not break the JSON a later call takes its values from.
    if (code === 0) return { content: stdout, isError: false };

    return {
      content: [stdout, stderr, `Exit code ${code}`].filter(Boolean).join("\n"),
      isError: true,
    };
  }

  #allows(command: string): boolean {
    return this.#props.allow.some((allowed) =>
      typeof allowed === "string"
        ? command.startsWith(allowed)
        : allowed.test(command),
    );
  }

  #run(command: string, options: RunOptions): Promise<RunResult> {
    return new Promise((resolve, reject) => {
      const child = spawn("bash", ["-c", command], {
        cwd: options.cwd,
        env: options.env,
        timeout: options.timeoutMs,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf8").on("data", (data) => (stdout += data));
      child.stderr.setEncoding("utf8").on("data", (data) => (stderr += data));

      child.on("error", reject);
      child.on("close", (code) => resolve({ code, stdout, stderr }));
    });
  }
}

interface RunOptions {
  cwd: string | undefined;
  env: NodeJS.ProcessEnv;
  timeoutMs: number;
}

interface RunResult {
  code: number | null;
  stdout: string;
  stderr: string;
}
