import fs from "node:fs/promises";
import z from "zod";
import { SystemProcess } from "../system/SystemProcess.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { Scenario } from "./Scenario.ts";
import { ScenarioPlayer } from "./ScenarioPlayer.ts";
import { ScenarioRecorder } from "./ScenarioRecorder.ts";
import { ScenarioReporter } from "./ScenarioReporter.ts";
import { ScenarioStore } from "./ScenarioStore.ts";

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
      this.#reportFinished();

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
      ScenarioReporter.playing(
        this.#path,
        this.#store.fileName(file.scenario.id),
      );
      await this.#play(text, file);
    } else {
      logger.info(`Scenario not found in the store, recording...`);
      ScenarioReporter.recording(
        this.#path,
        this.#store.fileName(Scenario.textToId(text)),
      );
      await this.#record(text);
    }

    this.#reportFinished();
    await SystemProcess.exit(0);
  }

  #reportFinished() {
    const elapsedMs = performance.now() - this.#startedAt;
    logger.info(`Scenario run finished in ${elapsedMs}ms`);
    ScenarioReporter.finished(elapsedMs);
  }

  async #play(text: string, file: ScenarioStore.File) {
    const player = new ScenarioPlayer(file.scenario);

    const result = await player.play();

    ScenarioReporter.cacheTotal(player.lookups);

    if (result.status === "success") {
      // NOTE: The details are the account the recording agent gave of the run.
      // A playback re-performs those very steps and agrees with every check it
      // recorded, so what was verified then is what was verified now.
      const { details } = file.scenario.verdict ?? {};
      logger.info(`Scenario passed: ${details ?? "no recorded details"}`);
      ScenarioReporter.passed(
        Scenario.executableStepsCount(file.scenario),
        details,
      );
      return;
    }

    if (result.status === "failure") {
      logger.info("Scenario playback failed, starting recovery...");
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

    ScenarioReporter.cacheTotal(recorder.lookups);

    // NOTE: A failed run is not saved, which leaves the recording a recovery
    // failed on right where it was. That is what should happen: the next run
    // plays it, fails on it and recovers again for as long as the application is
    // broken, and the moment it is fixed the playback passes with no agent at
    // all.
    if (result.status === "failure") {
      logger.error(`Scenario failed: ${result.details}`);
      ScenarioReporter.failed(result.details);
      this.#reportFinished();
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

    const stepsCount = Scenario.executableStepsCount(recorder.scenario);

    logger.info(`Saved scenario recording to ${path}`);
    ScenarioReporter.saved(path, stepsCount);

    // NOTE: Printed after the save, so that the run ends on what the agent had
    // to say about it, the way a failed one ends on why it failed.
    logger.info(`Scenario passed: ${result.details}`);
    ScenarioReporter.passed(stepsCount, result.details);
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
