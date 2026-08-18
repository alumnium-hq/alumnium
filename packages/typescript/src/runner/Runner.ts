import fs from "node:fs/promises";
import z from "zod";
import { Env } from "../Env.ts";
import { createCacheLookups } from "../llm/llmSchema.ts";
import { addMcpTokenUsage, createMcpTokenUsage } from "../mcp/mcpTokenUsage.ts";
import { SystemProcess } from "../system/SystemProcess.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { Scenario } from "./Scenario.ts";
import { ScenarioCost } from "./ScenarioCost.ts";
import { ScenarioPlayer } from "./ScenarioPlayer.ts";
import { ScenarioRecorder } from "./ScenarioRecorder.ts";
import { ScenarioReporter } from "./ScenarioReporter.ts";
import { ScenarioStore } from "./ScenarioStore.ts";
import { ScenarioSummary } from "./ScenarioSummary.ts";

const { logger } = Telemetry.get(import.meta.url);

export namespace Runner {
  export type ToolArguments = z.infer<typeof Runner.ToolArguments>;

  export type MaskMap = Record<string, string>;

  export interface RecoverProps {
    text: string;
    file: ScenarioStore.File;
    error: string;
    logs: ScenarioPlayer.Log[];
  }
}

export class Runner {
  static ToolArguments = z.record(z.string(), z.unknown());

  #path: string;
  #store = new ScenarioStore();
  #startedAt = performance.now();

  // What the run turned out to be, accumulated as the phases below report it, so
  // that `#reportFinished` can price and summarize whichever path the run took -
  // including the one that threw.
  #id: Scenario.Id | undefined;
  #mode: ScenarioSummary.Mode = "record";
  #playbackFailed = false;
  #recovered = false;
  #passed = false;
  #error: string | undefined;
  #stepsCount = 0;
  #lookups = createCacheLookups();
  #unstableChecks = 0;
  #mainAgentUsage: ScenarioCost.MainAgentUsage | undefined;
  #alumniumUsage = createMcpTokenUsage();

  constructor(path: string) {
    this.#path = path;
  }

  async run() {
    try {
      await this.#run();
    } catch (error) {
      // NOTE: The last resort, so that anything the phases below did not turn
      // into a verdict of its own still ends as a failed run with an exit code,
      // rather than as an unhandled rejection that reports nothing. `bin.ts` is
      // left without a handler on purpose - the runner is what owns the
      // reporting.
      const message = `Scenario run failed: ${error}`;
      logger.error(`${message}: {error}`, { error });
      ScenarioReporter.failed(message);
      this.#error = message;
      await this.#reportFinished();

      return SystemProcess.exit(1);
    }
  }

  async #run() {
    logger.info(`Running scenario ${this.#path}`);
    this.#startedAt = performance.now();

    const text = await this.#readScenarioText();
    const file = await this.#store.lookup(text);

    if (file) {
      logger.info(
        `Scenario ${file.scenario.id} found in the store, playing...`,
      );
      this.#mode = "replay";
      this.#id = file.scenario.id;
      ScenarioReporter.playing(
        this.#path,
        this.#store.fileName(file.scenario.id),
      );
      await this.#play(text, file);
    } else {
      logger.info(`Scenario not found in the store, recording...`);
      this.#id = Scenario.textToId(text);
      ScenarioReporter.recording(this.#path, this.#store.fileName(this.#id));
      await this.#record(text);
    }

    await this.#reportFinished();
    await SystemProcess.exit(0);
  }

  /**
   * Prices the run, prints how it went, and writes the summary - the last thing
   * every path through the runner does, including the one that threw.
   */
  async #reportFinished() {
    const elapsedMs = performance.now() - this.#startedAt;

    const summary = ScenarioSummary.of({
      scenario: this.#path,
      id: this.#id,
      mode: this.#mode,
      playbackFailed: this.#playbackFailed,
      recovered: this.#recovered,
      passed: this.#passed,
      durationMs: elapsedMs,
      stepsCount: this.#stepsCount,
      lookups: this.#lookups,
      unstableChecks: this.#unstableChecks,
      mainAgentUsage: this.#mainAgentUsage,
      alumniumUsage: this.#alumniumUsage,
      error: this.#error,
    });

    ScenarioReporter.cost({
      mainUsd: summary.mainAgent.costUsd,
      alumniumUsd: summary.alumnium.costUsd,
      totalUsd: summary.totalCostUsd,
    });

    logger.info(`Scenario run finished in ${elapsedMs}ms`);
    ScenarioReporter.finished(elapsedMs);

    await ScenarioSummary.write(summary);
  }

  async #play(text: string, file: ScenarioStore.File) {
    const player = new ScenarioPlayer(file.scenario);

    const result = await player.play();

    this.#stepsCount = Scenario.executableStepsCount(file.scenario);
    this.#lookups = player.lookups;
    this.#unstableChecks = player.unstableChecks.length;
    addMcpTokenUsage(this.#alumniumUsage, player.alumniumUsage);

    ScenarioReporter.cacheTotal(player.lookups);
    // NOTE: Before the branch, so it prints whether the playback passed or went
    // on to fail on a later step. An unstable check is a property of the run, not
    // of its outcome.
    ScenarioReporter.unstableChecks(player.unstableChecks.length);

    if (result.status === "success") {
      // NOTE: The details are the account the recording agent gave of the run.
      // A playback re-performs those very steps and agrees with every check it
      // recorded - or, for an unstable one, agrees on a re-ask - so what was
      // verified then is what was verified now.
      const { details } = file.scenario.verdict ?? {};
      logger.info(`Scenario passed: ${details ?? "no recorded details"}`);
      this.#passed = true;
      ScenarioReporter.passed(this.#stepsCount, details);
      return;
    }

    if (result.status === "failure") {
      // NOTE: Set whether or not a recovery follows, so that a run measuring
      // playback with recovery off still reports that the playback was where it
      // failed - as opposed to a crash, which the catch-all in `run` reports.
      this.#playbackFailed = true;
      this.#error = result.error;

      if (!Env.ALUMNIUM_SCENARIO_RECOVERY) {
        logger.info("Scenario playback failed, recovery is off");
        ScenarioReporter.notRecovering();
        await this.#reportFinished();
        return SystemProcess.exit(1);
      }

      logger.info("Scenario playback failed, starting recovery...");
      // NOTE: Kept whatever the recovery goes on to do. The run recovered either
      // way, and that it then passed is what `passed` says.
      this.#recovered = true;
      ScenarioReporter.recovering();
      await this.#recover({
        text,
        file,
        error: result.error,
        logs: result.logs,
      });
    }
  }

  async #record(text: string) {
    const recorder = new ScenarioRecorder({
      text,
      path: this.#path,
    });

    await this.#recordWith(recorder);
  }

  /**
   * Records the scenario again, after a playback of its recording failed.
   *
   * NOTE: The stale recording goes in as the text of the recovery's prompt, and
   * not as the Claude Code session to resume it once was. That session ends on a
   * successful run of this very scenario, and an agent that reads it concludes
   * the work is already done - see `ScenarioRecovery`.
   *
   * @param props - What failed, and the recording it failed on.
   */
  async #recover(props: Runner.RecoverProps) {
    const { text, file, error, logs } = props;

    const recorder = new ScenarioRecorder({
      text,
      path: this.#path,
      recovery: { scenario: file.scenario, error, logs },
    });

    return this.#recordWith(recorder);
  }

  async #recordWith(recorder: ScenarioRecorder) {
    const result = await recorder.record();

    // NOTE: Added rather than assigned, since a recovery's recorder is the second
    // Alumnium session of the run - the playback it replaces drove one of its own.
    // The main agent's usage is this recorder's alone: a playback runs no agent,
    // and a recovery is the only recorder a run ever has.
    this.#stepsCount = Scenario.executableStepsCount(recorder.scenario);
    this.#lookups = recorder.lookups;
    this.#mainAgentUsage = recorder.mainAgentUsage;
    addMcpTokenUsage(this.#alumniumUsage, recorder.alumniumUsage);

    ScenarioReporter.cacheTotal(recorder.lookups);

    // NOTE: A failed run is not saved, which leaves the recording a recovery
    // failed on right where it was. That is what should happen: the next run
    // plays it, fails on it and recovers again for as long as the application is
    // broken, and the moment it is fixed the playback passes with no agent at
    // all.
    if (result.status === "failure") {
      logger.error(`Scenario failed: ${result.details}`);
      ScenarioReporter.failed(result.details);
      this.#error = result.details;
      await this.#reportFinished();
      return SystemProcess.exit(1);
    }

    // NOTE: The session is saved but no longer read back - a recovery re-records
    // in a fresh one (see `ScenarioRecovery`). It is kept as the transcript of
    // how a recording came to be, which is the only place that survives, since
    // the store keeps Claude Code from writing one to `~/.claude`.
    const path = await this.#store.save({
      scenario: recorder.scenario,
      session: result.session,
    });

    logger.info(`Saved scenario recording to ${path}`);
    ScenarioReporter.saved(path, this.#stepsCount);

    // NOTE: Printed after the save, so that the run ends on what the agent had
    // to say about it, the way a failed one ends on why it failed.
    logger.info(`Scenario passed: ${result.details}`);
    this.#passed = true;
    this.#id = recorder.scenario.id;
    // NOTE: Cleared, since a recovery that passed sets it on its way in and the
    // run did not fail. Why the playback failed stays in the log.
    this.#error = undefined;
    ScenarioReporter.passed(this.#stepsCount, result.details);
  }

  async #readScenarioText(): Promise<string> {
    try {
      // NOTE: Awaited, so that the failure lands in this catch and is reported as
      // the missing scenario file it is. Returning the promise leaves it to the
      // catch-all in `run`, which can only say the run failed.
      return await fs.readFile(this.#path, "utf-8");
    } catch (error) {
      logger.error(`Failed to read scenario file at ${this.#path}: ${error}`);
      return SystemProcess.exit(1);
    }
  }
}
