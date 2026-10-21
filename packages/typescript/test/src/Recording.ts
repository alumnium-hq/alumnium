import { xxh64Str } from "@js-fns/xxhash/str";
import z from "zod";

export namespace Recording {
  export type Id = z.infer<typeof Recording.Id>;
  export type Input = z.infer<typeof Recording.Input>;
  export type Content = z.infer<typeof Recording.Content>;
  export type ToolCall = z.infer<typeof Recording.ToolCall>;
  export type ToolResult = z.infer<typeof Recording.ToolResult>;
  export type ToolStep = z.infer<typeof Recording.ToolStep>;
  export type NarrationStep = z.infer<typeof Recording.NarrationStep>;
  export type Step = z.infer<typeof Recording.Step>;
  export type Verdict = z.infer<typeof Recording.Verdict>;
  export type Type = z.infer<typeof Recording.Schema>;
}

/**
 * A replayable recording of a test run: every tool call the host agent made,
 * paired with its result, and the agent's narration in between.
 *
 * Agent-neutral on purpose. The host (e.g. a test runner or the CLI)
 * owns the agent loop and translates its own messages into the calls and
 * results recorded here, so nothing in a recording is specific to the agent
 * that made it but its name.
 */
export abstract class Recording {
  static Id = z.string().brand("Recording.Id");
  static Input = z.record(z.string(), z.unknown());

  /**
   * MCP content blocks a tool returned, or a bare string for a host tool that
   * returns plain output. Only text blocks are ever read, every other block is
   * kept as it was.
   */
  static Content = z.union([
    z.string(),
    z.array(z.looseObject({ type: z.string() })),
  ]);

  static ToolCall = z.object({
    /** Call id the host agent assigned, used to pair the call with its result. */
    id: z.string(),
    /** MCP server the tool belongs to, absent for a host tool (e.g. `Bash`). */
    server: z.string().optional(),
    /** Tool name as the server (or the host) exposes it, e.g. `do`. */
    tool: z.string(),
    input: this.Input,
  });

  static ToolResult = z.object({
    content: this.Content,
    isError: z.boolean(),
  });

  /**
   * A tool call and its result, whether it went to Alumnium's own MCP server,
   * another MCP server or a host tool - `call.server` tells them apart. Replay
   * re-issues every one, since a tool call can produce values later calls
   * consume.
   */
  static ToolStep = z.object({
    kind: z.literal("tool-call"),
    call: this.ToolCall,
    result: this.ToolResult,
  });

  /**
   * Something the agent said rather than did: a piece of its thinking, or a
   * message meant for the person running the test. Recorded so that a replay
   * reads like the recording it came from, and never executed.
   */
  static NarrationStep = z.object({
    kind: z.literal("narration"),
    narration: z.enum(["thinking", "assistant"]),
    text: z.string(),
  });

  static Step = z.union([this.ToolStep, this.NarrationStep]);

  static Verdict = z.object({
    status: z.enum(["success", "failure"]),
    /**
     * What happened, as the agent reported it: what the test verified when it
     * passed, what failed and how when it did not.
     */
    details: z.string(),
  });

  static DEFAULT_VERSION = 1;

  static Schema = z.object({
    id: this.Id,
    /**
     * Version of the host's recording setup. A host bumps it when its tools or
     * prompts change enough that existing recordings should be recorded
     * again, e.g. on a major release.
     */
    version: z.number().int().positive(),
    text: z.string(),
    /** Host agent that made the recording, e.g. `claude-code`. */
    agent: z.string(),
    alumnium: z.object({ version: z.string() }),
    /**
     * Names of the host variables the recording refers to as `<host-var.name>`
     * masks. Never their values: replay takes fresh ones from the host.
     */
    hostVars: z.array(z.string()),
    steps: z.array(this.Step),
    verdict: this.Verdict,
  });

  /**
   * Converts test text to a recording ID using a hash function.
   *
   * @param text - Test text to convert to ID.
   * @returns Recording ID generated from the trimmed text.
   */
  static textToId(text: string): Recording.Id {
    return xxh64Str(text.trim()) as Recording.Id;
  }

  /**
   * Key a tool call is configured by, e.g. in `maskResponsePaths`:
   * `<server>/<tool>` for an MCP tool, the bare tool name for a host tool.
   *
   * @param call - Tool call to get the key of.
   * @returns Tool key.
   */
  static toolKey(call: Pick<Recording.ToolCall, "server" | "tool">): string {
    return call.server ? `${call.server}/${call.tool}` : call.tool;
  }

  /**
   * Number of steps a replay executes, which is everything the agent did as
   * opposed to said.
   *
   * @param recording - Recording to count the steps of.
   * @returns Number of executable steps.
   */
  static executableStepsCount(recording: Recording.Type): number {
    return recording.steps.filter((step) => step.kind !== "narration").length;
  }
}
