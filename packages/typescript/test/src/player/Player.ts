import z from "zod";
import { Env, Telemetry } from "@alumnium/core/internal";
import {
  alumniumMaskerProps,
  DEFAULT_ALUMNIUM_SERVER,
} from "../masker/alumniumMaskerProps.ts";
import { Masker } from "../masker/Masker.ts";
import { contentTexts, parseJson } from "../masker/maskerUtils.ts";
import { Recording } from "../Recording.ts";
import type { ToolExecutor } from "./ToolExecutor.ts";

const { logger } = Telemetry.get(import.meta.url);

const START_TOOL = "start";
const STOP_TOOL = "stop";
const CHECK_TOOL = "check";

const NO_CACHE_META = { "alumnium.ai/cache": false };
const NO_CHANGE_ANALYSIS_META = { "alumnium.ai/change-analysis": false };

const DEFAULT_SKIP_TOOLS = ["ToolSearch", "TodoWrite"];

const DriverOutput = z.object({ id: z.string() });
const CheckOutput = z.object({ result: z.enum(["success", "failure"]) });

export namespace Player {
  export interface Props extends Masker.Props {
    executor: ToolExecutor;
    /** Name of Alumnium MCP server, `alumnium` by default. */
    alumniumServer?: string | undefined;
    skipTools?: string[] | undefined;
    checkConfirmations?: number | undefined;
    observer?: Observer | undefined;
  }

  export interface Observer {
    onNarration?(step: Recording.NarrationStep): void;
    onToolCall?(call: ToolExecutor.Call): void;
    onToolResult?(call: ToolExecutor.Call, result: Recording.ToolResult): void;
    onToolSkipped?(call: Recording.ToolCall, reason: string): void;
    onCheck?(call: ToolExecutor.Call, outcome: CheckOutcome): void;
  }

  /**
   * How a replayed `check` verdict compares with the recorded one:
   *
   * - `agreed` - the same verdict;
   * - `improved` - recorded failing, passing now, which does not fail the
   *   replay: the agent may have gone on past it, or the app got fixed;
   * - `unstable` - disagreed, then agreed when re-asked;
   * - `disagreed` - disagreed however many times it was re-asked, which
   *   fails the replay.
   */
  export type CheckOutcome = "agreed" | "improved" | "unstable" | "disagreed";

  /**
   * A recorded tool step a replay executed or skipped, in order, with each
   * re-asked `check` as another attempt. The `stop` calls the Player makes
   * for drivers a replay left open are not included.
   *
   * Inputs are unmasked, so calls may carry secrets and are not safe to
   * persist as they are.
   */
  export interface PlayedCall {
    /** Index in `Recording.steps`. */
    stepIndex: number;
    /** As recorded, masks included, when skipped. */
    call: ToolExecutor.Call;
    result?: Recording.ToolResult | undefined;
    skipped?: string | undefined;
    /** What the executor threw. */
    error?: string | undefined;
    /**
     * Outcome of the `check` step as a whole, the same on every attempt;
     * each attempt's own verdict is in its `result`.
     */
    check?: CheckOutcome | undefined;
    /** From 1, above it for a re-asked `check`. */
    attempt: number;
    startedAt: string;
    endedAt: string;
  }

  export interface Replayed {
    status: "replayed";
    verdict: Recording.Verdict;
    calls: PlayedCall[];
  }

  /**
   * Its `calls` end with the call it diverged at, unless it diverged before
   * executing the step, e.g. on input with unresolved masks.
   */
  export interface Diverged {
    status: "diverged";
    error: string;
    /** Index of the step it diverged at in `Recording.steps`. */
    stepIndex: number;
    calls: PlayedCall[];
  }

  export type Result = Replayed | Diverged;
}

export class Player {
  #options: PlayerRun.Options;
  #maskerProps: Masker.Props;

  constructor(props: Player.Props) {
    const {
      executor,
      alumniumServer = DEFAULT_ALUMNIUM_SERVER,
      skipTools = DEFAULT_SKIP_TOOLS,
      checkConfirmations,
      observer = {},
      ...maskerProps
    } = props;

    this.#options = {
      executor,
      server: alumniumServer,
      skipTools: new Set(skipTools),
      checkConfirmations,
      observer,
    };
    this.#maskerProps = alumniumMaskerProps(maskerProps, alumniumServer);
  }

  /**
   * Replays a recording, e.g. one `TestCache.lookup` found.
   *
   * @param recording - Recording to replay.
   * @returns Replay result.
   */
  async play(recording: Recording.Type): Promise<Player.Result> {
    const run = new PlayerRun(this.#options, new Masker(this.#maskerProps));
    try {
      return await run.play(recording);
    } finally {
      await run.stopDrivers();
    }
  }
}

class Diverged extends Error {}

namespace PlayerRun {
  export interface Options {
    executor: ToolExecutor;
    server: string;
    skipTools: Set<string>;
    checkConfirmations: number | undefined;
    observer: Player.Observer;
  }
}

class PlayerRun {
  #options: PlayerRun.Options;
  #masker: Masker;
  #driverIds = new Set<string>(); // Started and not stopped yet.
  #calls: Player.PlayedCall[] = [];

  constructor(options: PlayerRun.Options, masker: Masker) {
    this.#options = options;
    this.#masker = masker;
  }

  get #observer(): Player.Observer {
    return this.#options.observer;
  }

  async play(recording: Recording.Type): Promise<Player.Result> {
    const stepsCount = Recording.executableStepsCount(recording);
    let stepNumber = 0;

    for (const [stepIndex, step] of recording.steps.entries()) {
      if (step.kind === "narration") {
        this.#observer.onNarration?.(step);
        continue;
      }

      logger.info(`Replaying step ${++stepNumber}/${stepsCount}`);

      try {
        await this.#playToolStep(step, stepIndex);
      } catch (error) {
        const message = error instanceof Diverged ? error.message : `${error}`;
        logger.error(`Replay diverged at step ${stepNumber}: ${message}`);
        const calls = this.#calls;
        return { status: "diverged", error: message, stepIndex, calls };
      }
    }

    logger.info(`Replayed all ${stepsCount} steps`);
    const { verdict } = recording;
    return { status: "replayed", verdict, calls: this.#calls };
  }

  async stopDrivers() {
    for (const id of this.#driverIds) {
      try {
        logger.info(`Stopping driver ${id} the replay did not stop`);
        await this.#options.executor.execute({
          server: this.#options.server,
          tool: STOP_TOOL,
          input: { id, save_cache: false },
        });
      } catch (error) {
        logger.warn(`Failed to stop driver ${id}: {error}`, { error });
      }
    }
    this.#driverIds.clear();
  }

  async #playToolStep(step: Recording.ToolStep, stepIndex: number) {
    const { call: recordedCall, result: recordedResult } = step;
    const { id, ...callProps } = recordedCall;
    const toolKey = Recording.toolKey(recordedCall);

    // A call that failed when recorded produced no values, and the calls
    // that follow are there because it failed - usually its retry, which
    // running it again could get in the way of.
    if (recordedResult.isError)
      return this.#skip(recordedCall, stepIndex, "it failed when recorded");

    if (!this.#options.executor.handles(callProps)) {
      if (this.#options.skipTools.has(toolKey))
        return this.#skip(
          recordedCall,
          stepIndex,
          "it only exists inside the agent",
        );
      throw new Diverged(`No executor for tool '${toolKey}'`);
    }

    const call: ToolExecutor.Call = {
      ...callProps,
      input: this.#masker.unmaskInput(toolKey, recordedCall.input),
    };

    const unresolved = Masker.findUnresolvedMasks(call.input);
    if (unresolved.length)
      throw new Diverged(
        `Tool '${toolKey}' input has unresolved masks: ${unresolved.join(", ")}`,
      );

    const result = await this.#execute(
      call,
      stepIndex,
      call.server === this.#options.server && call.tool === START_TOOL
        ? { meta: NO_CHANGE_ANALYSIS_META }
        : undefined,
    );

    if (result.isError)
      throw new Diverged(
        `Tool '${toolKey}' failed: ${contentTexts(result.content).join("\n")}`,
      );

    // Under the recorded call's id, which the masks of later inputs name.
    this.#masker.registerOutput(id, result.content, toolKey);

    if (call.server !== this.#options.server) return;

    switch (call.tool) {
      case START_TOOL: {
        const driverId = this.#parseOutput(result.content, DriverOutput)?.id;
        if (driverId) this.#driverIds.add(driverId);
        break;
      }

      case STOP_TOOL: {
        const driverId = DriverOutput.safeParse(call.input).data?.id;
        if (driverId) this.#driverIds.delete(driverId);
        break;
      }

      case CHECK_TOOL:
        await this.#compareCheck(call, stepIndex, recordedResult, result);
        break;
    }
  }

  async #execute(
    call: ToolExecutor.Call,
    stepIndex: number,
    options?: ToolExecutor.ExecuteOptions,
    attempt = 1,
  ): Promise<Recording.ToolResult> {
    this.#observer.onToolCall?.(call);
    const startedAt = new Date().toISOString();
    const played: Player.PlayedCall = {
      stepIndex,
      call,
      attempt,
      startedAt,
      endedAt: startedAt,
    };
    this.#calls.push(played);
    try {
      played.result = await this.#options.executor.execute(call, options);
    } catch (error) {
      played.error = `${error}`;
      throw error;
    } finally {
      played.endedAt = new Date().toISOString();
    }
    this.#observer.onToolResult?.(call, played.result);
    return played.result;
  }

  #skip(call: Recording.ToolCall, stepIndex: number, reason: string) {
    logger.info(`Skipping tool '${Recording.toolKey(call)}', ${reason}`);
    const { id: _, ...callProps } = call;
    const now = new Date().toISOString();
    this.#calls.push({
      stepIndex,
      call: callProps,
      skipped: reason,
      attempt: 1,
      startedAt: now,
      endedAt: now,
    });
    this.#observer.onToolSkipped?.(call, reason);
  }

  async #compareCheck(
    call: ToolExecutor.Call,
    stepIndex: number,
    recorded: Recording.ToolResult,
    replayed: Recording.ToolResult,
  ) {
    const confirmations =
      this.#options.checkConfirmations ?? Env.ALUMNIUM_CHECK_CONFIRMATIONS;
    const expected = this.#checkVerdict(recorded);
    let actual = this.#checkVerdict(replayed);
    let outcome: Player.CheckOutcome;

    if (!expected || !actual) {
      throw new Diverged(
        `Cannot read '${Recording.toolKey(call)}' verdict to compare`,
      );
    } else if (expected === actual) {
      outcome = "agreed";
    } else if (expected === "failure") {
      outcome = "improved";
    } else {
      let attempt = 0;
      while (actual !== expected && attempt++ < confirmations) {
        logger.info(`Re-asking check ${attempt}/${confirmations}`);
        const result = await this.#execute(
          call,
          stepIndex,
          { meta: NO_CACHE_META },
          attempt + 1,
        );
        actual = result.isError ? null : this.#checkVerdict(result);
      }

      outcome = actual === expected ? "unstable" : "disagreed";
    }

    for (const played of this.#calls)
      if (played.stepIndex === stepIndex) played.check = outcome;

    this.#observer.onCheck?.(call, outcome);

    if (outcome === "disagreed")
      throw new Diverged(
        `Check '${call.input["statement"]}' failed where it passed when recorded` +
          (confirmations
            ? `, re-asked ${confirmations} times with the cache bypassed`
            : ""),
      );
  }

  #checkVerdict(
    result: Recording.ToolResult,
  ): z.infer<typeof CheckOutput>["result"] | null {
    return this.#parseOutput(result.content, CheckOutput)?.result ?? null;
  }

  #parseOutput<Type>(
    content: Recording.Content,
    schema: z.ZodType<Type>,
  ): Type | null {
    for (const text of contentTexts(content)) {
      const parsed = schema.safeParse(parseJson(text));
      if (parsed.success) return parsed.data;
    }
    return null;
  }
}
