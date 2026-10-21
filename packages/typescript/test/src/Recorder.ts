import { ALUMNIUM_VERSION, Telemetry } from "@alumnium/core/internal";
import { Masker } from "./masker/Masker.ts";
import { Recording } from "./Recording.ts";
import { RecordingLeakError } from "./RecordingLeakError.ts";

const { logger } = Telemetry.get(import.meta.url);

const DEFAULT_ALUMNIUM_SERVER = "alumnium";
const ALUMNIUM_START_TOOL = "start";

export namespace Recorder {
  export interface Props extends Masker.Props {
    text: string;
    agent: string;
    /** See `Recording.Schema` `version`, `Recording.DEFAULT_VERSION` by default. */
    version?: number | undefined;
    /** Name the host gave Alumnium's MCP server, `alumnium` by default. */
    alumniumServer?: string | undefined;
  }

  export interface ToolUse {
    id: string;
    /** MCP server the tool belongs to, absent for a host tool (e.g. `Bash`). */
    server?: string | undefined;
    tool: string;
    input: unknown;
  }

  export interface ToolResult {
    id: string;
    content: Recording.Content;
    isError?: boolean | undefined;
  }

  export interface Narration {
    narration: Recording.NarrationStep["narration"];
    text: string;
  }
}

/**
 * Agent-agnostic sink turning the host agent's tool calls and narration into a
 * replayable recording. The host owns the agent loop and reports what happens
 * in it. The recorder masks the values a replay has to refresh or must never
 * see in clear (see `Masker`) and pairs each call with its result.
 */
export class Recorder {
  #text: string;
  #agent: string;
  #version: number;
  #masker: Masker;
  #steps: Recording.Step[] = [];
  #pendingCalls = new Map<string, Recording.ToolCall>();
  #recording: Recording.Type | undefined;

  constructor(props: Recorder.Props) {
    const { text, agent, version, alumniumServer, ...maskerProps } = props;
    this.#version = version ?? Recording.DEFAULT_VERSION;
    this.#text = text;
    this.#agent = agent;
    const server = alumniumServer ?? DEFAULT_ALUMNIUM_SERVER;
    this.#masker = new Masker({
      ...maskerProps,
      registerResponsePaths: {
        ...this.#alumniumRegisterResponsePaths(server),
        ...maskerProps.registerResponsePaths,
      },
      // Alumnium's goals and statements are prose an LLM reads, which takes
      // its values from `params`.
      wholeValueOnlyTools: [
        `${server}/*`,
        ...(maskerProps.wholeValueOnlyTools ?? []),
      ],
    });
  }

  /**
   * Records a tool call, held until its result arrives.
   *
   * Masked here, on the call, and not once the step is pushed in `onToolResult`.
   * A tool call's output is only registered once its result arrives,
   * so a call can neither mask its own input, nor - when the
   * agent runs tools in parallel - be masked with a value that did not exist
   * yet when it was issued.
   *
   * A tool replay cannot execute is masked too. Its input is
   * never re-run, so nothing gets substituted back into it, but masking still
   * keeps the value a recording happened to produce - often a credential - out
   * of the stored recording.
   *
   * @param use - Tool call as the host agent issued it.
   */
  onToolUse(use: Recorder.ToolUse) {
    this.#assertNotFinished();

    const { id, server, tool, input } = use;
    const toolKey = Recording.toolKey({ server, tool });

    logger.debug(`Recording tool use '${toolKey}' ({id})`, { id });

    this.#pendingCalls.set(id, {
      id,
      ...(server ? { server } : {}),
      tool,
      input: this.#masker.maskInput(toolKey, input),
    });
  }

  /**
   * Records the result of a tool call, pushing the call as a step.
   *
   * Steps land in the order results arrive. The values a call produced are
   * registered under its id, which later masks refer to.
   *
   * @param toolResult - Result of a call reported with `onToolUse`.
   */
  onToolResult(toolResult: Recorder.ToolResult) {
    this.#assertNotFinished();

    const { id, content } = toolResult;
    const isError = Boolean(toolResult.isError);

    const call = this.#pendingCalls.get(id);
    if (!call) {
      logger.debug(`No recorded tool use for result '${id}', ignoring it`);
      return;
    }

    this.#pendingCalls.delete(id);

    logger.debug(`Recording '${call.tool}' tool result`);

    // Replay skips a failed call, so only its secrets are registered.
    this.#masker.registerOutput(id, content, Recording.toolKey(call), {
      secretsOnly: isError,
    });

    this.#steps.push({
      kind: "tool-call",
      call,
      result: { content: structuredClone(content), isError },
    });
  }

  /**
   * Records what the agent said, so that a replay of this recording reads the
   * way the recording did. Nothing is executed from it.
   *
   * Pushed as it arrives, while a tool call is pushed once its result
   * does. Narration therefore lands ahead of the call it introduced, which is
   * the order the agent produced them in.
   *
   * @param narration - Prose as the agent wrote it.
   */
  onNarration(narration: Recorder.Narration) {
    this.#assertNotFinished();

    // Empty prose is dropped rather than stored.
    if (!narration.text.trim()) return;

    this.#steps.push({
      kind: "narration",
      narration: narration.narration,
      text: narration.text,
    });
  }

  /**
   * Finishes the recording with the run's verdict. Calls still waiting for a
   * result are dropped, since replay has nothing to compare them against.
   *
   * @param verdict - Verdict the host agent reached.
   * @returns Finished recording.
   * @throws {RecordingLeakError} when a host variable or a secret survived
   *   masking, so that the recording is never stored with it.
   */
  finish(verdict: Recording.Verdict): Recording.Type {
    this.#assertNotFinished();

    if (this.#pendingCalls.size)
      logger.warn(
        `Dropping ${this.#pendingCalls.size} tool calls with no result: ${[
          ...this.#pendingCalls.values(),
        ]
          .map(({ tool }) => tool)
          .join(", ")}`,
      );
    this.#pendingCalls.clear();

    const recording: Recording.Type = {
      id: Recording.textToId(this.#text),
      version: this.#version,
      text: this.#text,
      agent: this.#agent,
      alumnium: { version: ALUMNIUM_VERSION },
      hostVars: [],
      steps: this.#steps.map((step) => this.#maskStep(step)),
      verdict: {
        status: verdict.status,
        details: this.#masker.maskNarration(verdict.details),
      },
    };

    const masked = [
      recording.steps.map((step) =>
        step.kind === "narration"
          ? step.text
          : [step.call.input, step.result.content],
      ),
      recording.verdict.details,
    ];

    const leaks = this.#masker.findLeaks(masked);
    if (leaks.length) throw new RecordingLeakError(leaks);

    recording.hostVars = Masker.findHostVarNames(masked);
    this.#recording = recording;

    return recording;
  }

  /**
   * Masks a step's result or narration. Done on finish rather than as the step
   * arrives, once every secret of the run is registered: a result can arrive
   * ahead of the parallel call producing a secret it holds. Neither is ever
   * executed, so a later secret can be masked in them safely, unlike in an
   * input (see `onToolUse`).
   *
   * @param step - Step as recorded.
   * @returns Masked step.
   */
  #maskStep(step: Recording.Step): Recording.Step {
    if (step.kind === "narration") {
      return { ...step, text: this.#masker.maskNarration(step.text) };
    } else {
      return {
        ...step,
        result: {
          ...step.result,
          content: this.#masker.maskResult(step.result.content),
        },
      };
    }
  }

  /**
   * Response paths of Alumnium's own tools worth registering: only the driver
   * id a `start` returns. Every other output is the outcome of the call,
   * re-produced by replaying it, and its small values - seconds waited, token
   * counts - would otherwise take the mask of a value a later non-Alumnium call
   * produces, since the earliest call's mask wins.
   *
   * @param server - Name the host gave Alumnium's MCP server.
   * @returns `registerResponsePaths` for Alumnium's tools.
   */
  #alumniumRegisterResponsePaths(
    server: string = DEFAULT_ALUMNIUM_SERVER,
  ): Record<string, string[]> {
    return {
      [`${server}/*`]: [],
      [`${server}/${ALUMNIUM_START_TOOL}`]: ["id"],
    };
  }

  #assertNotFinished() {
    if (this.#recording) throw new Error("Recording is already finished");
  }
}
