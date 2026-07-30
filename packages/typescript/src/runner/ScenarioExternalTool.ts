import type {
  BashInput,
  FileReadInput,
} from "@anthropic-ai/claude-agent-sdk/sdk-tools";
import { spawn } from "node:child_process";
import fs from "node:fs/promises";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";
import { ScenarioExternalMcp } from "./ScenarioExternalMcp.ts";

const { logger } = Telemetry.get(import.meta.url);

export namespace ScenarioExternalTool {
  export type ExecuteFn = (
    input: ScenarioAlumniumMcp.Input,
  ) => Promise<ScenarioExternalTool.Result>;

  export interface ResultExecuted {
    status: "executed";
    output: string;
  }

  export interface ResultUnsupported {
    status: "unsupported";
    reason: string;
  }

  export interface ResultFailure {
    status: "failure";
    error: string;
  }

  export type Result = ResultExecuted | ResultUnsupported | ResultFailure;
}

/**
 * Re-executes the non-Alumnium tool calls made by the agent during recording.
 *
 * Tools of an external MCP server (`mcp__server__tool`) are called on that
 * server directly, see `ScenarioExternalMcp`. The rest are Claude Code built-ins
 * reproduced here.
 *
 * NOTE: The Claude Agent SDK doesn't expose implementations of its built-in
 * tools - they live in the Claude Code binary and are only reachable through an
 * agent turn. Only their input types are published, so the tools are reproduced
 * here against those types.
 *
 * NOTE: Tools (and tool inputs) that cannot be reproduced are reported as
 * `unsupported` rather than failing. Playback only needs the calls whose output
 * feeds MCP tool inputs, and a missing value surfaces later as an unresolved
 * mask naming the exact input it was needed for.
 */
export abstract class ScenarioExternalTool {
  static #executors: Record<string, ScenarioExternalTool.ExecuteFn> = {
    Bash: async (rawInput) => {
      const { command, timeout, run_in_background } = parseBashInput(rawInput);

      if (run_in_background)
        return {
          status: "unsupported",
          reason:
            "output of a background command is a shell id, not its output",
        };

      logger.debug(`Executing Bash command: ${command}`);

      return runCommand(command, timeout);
    },

    Read: async (rawInput) => {
      const { file_path, offset, limit, pages } = parseFileReadInput(rawInput);

      if (pages !== undefined)
        return {
          status: "unsupported",
          reason: "PDF page extraction cannot be reproduced",
        };

      logger.debug(`Reading file: ${file_path}`);
      const text = await fs.readFile(file_path, "utf-8");

      return { status: "executed", output: sliceLines(text, offset, limit) };
    },
  };

  static isSupported(name: string): boolean {
    if (name in this.#executors) return true;

    return ScenarioExternalMcp.parseToolUseName(name) !== null;
  }

  /**
   * Executes an external tool call.
   *
   * @param name - Tool name as recorded, e.g. `Bash` or `mcp__server__tool`.
   * @param input - Recorded tool input.
   * @param mcp - Client to reach external MCP servers through.
   * @returns Execution result, including the tool output when executed.
   */
  static async execute(
    name: string,
    input: ScenarioAlumniumMcp.Input,
    mcp: ScenarioExternalMcp,
  ): Promise<ScenarioExternalTool.Result> {
    const executor = this.#executor(name, mcp);
    if (!executor) {
      const reason = ScenarioExternalMcp.isToolUseName(name)
        ? `no MCP server configured for '${name}'`
        : `no executor for '${name}'`;
      logger.debug(`Skipping external tool: ${reason}`);
      return { status: "unsupported", reason };
    }

    try {
      return await executor(input);
    } catch (error) {
      const message = `External tool '${name}' failed: ${error}`;
      logger.error(message);
      return { status: "failure", error: message };
    }
  }

  /**
   * Resolves the tool name to the function that reproduces the call.
   *
   * @param name - Tool name as recorded.
   * @param mcp - Client to reach external MCP servers through.
   * @returns Executor, `undefined` when the tool cannot be reproduced.
   */
  static #executor(
    name: string,
    mcp: ScenarioExternalMcp,
  ): ScenarioExternalTool.ExecuteFn | undefined {
    const builtIn = this.#executors[name];
    if (builtIn) return builtIn;

    const call = ScenarioExternalMcp.parseToolUseName(name);
    if (!call) return undefined;

    return (input) => callMcpTool(mcp, call, input);
  }
}

/**
 * Calls a tool on an external MCP server.
 *
 * NOTE: Only the text blocks of the output are returned, joined the way the
 * recording stores them. The same text then reaches the masker in both phases,
 * so the values it registers line up.
 *
 * @param mcp - Client to reach external MCP servers through.
 * @param call - Server and tool to call.
 * @param input - Recorded tool input.
 * @returns Execution result carrying the tool's text output.
 */
async function callMcpTool(
  mcp: ScenarioExternalMcp,
  call: ScenarioExternalMcp.Call,
  input: ScenarioAlumniumMcp.Input,
): Promise<ScenarioExternalTool.Result> {
  const { server, tool } = call;

  const output = await mcp.call(server, tool, input);
  const text = ScenarioAlumniumMcp.outputTexts(output.content).join("\n");

  if (output.isError)
    return {
      status: "failure",
      error: `MCP tool '${tool}' of '${server}' returned an error: ${text || "no details"}`,
    };

  return { status: "executed", output: text };
}

/**
 * Runs a shell command, optionally bounded by a timeout.
 *
 * @param command - Command to run.
 * @param timeout - Timeout in milliseconds.
 * @returns Execution result carrying the command's standard output.
 */
function runCommand(
  command: string,
  timeout: number | undefined,
): Promise<ScenarioExternalTool.Result> {
  return new Promise((resolve) => {
    const child = spawn("sh", ["-c", command]);

    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf-8");
    child.stderr.setEncoding("utf-8");
    child.stdout.on("data", (chunk: string) => (stdout += chunk));
    child.stderr.on("data", (chunk: string) => (stderr += chunk));

    let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
    let settled = false;
    const settle = (result: ScenarioExternalTool.Result) => {
      if (settled) return;
      settled = true;
      clearTimeout(deadlineTimer);
      resolve(result);
    };

    if (timeout !== undefined)
      deadlineTimer = setTimeout(() => {
        child.kill();
        settle({
          status: "failure",
          error: `Bash command timed out after ${timeout}ms`,
        });
      }, timeout);

    child.on("error", (error) =>
      settle({
        status: "failure",
        error: `Bash command failed to start: ${error}`,
      }),
    );

    // NOTE: Settled on 'exit' rather than 'close', which additionally waits for
    // the output pipes to close. A process the command spawned can hold them
    // open long after the command itself exited, and after a timeout kill.
    child.on("exit", (code) => {
      if (code === 0) return settle({ status: "executed", output: stdout });

      settle({
        status: "failure",
        error: `Bash command exited with code ${code}: ${stderr.trim() || stdout.trim()}`,
      });
    });
  });
}

/**
 * Selects a line range the way the `Read` tool does, with a 1-based offset.
 */
function sliceLines(
  text: string,
  offset: number | undefined,
  limit: number | undefined,
): string {
  if (offset === undefined && limit === undefined) return text;

  const start = offset === undefined ? 0 : Math.max(0, offset - 1);
  const end = limit === undefined ? undefined : start + limit;

  return text.split("\n").slice(start, end).join("\n");
}

// NOTE: Recorded inputs come from JSON, so the SDK types are the contract but
// not a guarantee. Fields are validated and rebuilt explicitly, which also
// turns a renamed or newly required SDK field into a compile error.

function parseBashInput(input: ScenarioAlumniumMcp.Input): BashInput {
  const { command, timeout, run_in_background } = input;

  if (typeof command !== "string")
    throw new Error("Bash tool input has no 'command' string");

  return {
    command,
    ...(typeof timeout === "number" && { timeout }),
    ...(typeof run_in_background === "boolean" && { run_in_background }),
  };
}

function parseFileReadInput(input: ScenarioAlumniumMcp.Input): FileReadInput {
  const { file_path, offset, limit, pages } = input;

  if (typeof file_path !== "string")
    throw new Error("Read tool input has no 'file_path' string");

  return {
    file_path,
    ...(typeof offset === "number" && { offset }),
    ...(typeof limit === "number" && { limit }),
    ...(typeof pages === "string" && { pages }),
  };
}
