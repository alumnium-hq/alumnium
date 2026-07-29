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
      ScenarioReporter.passed(file.scenario.steps.length);
      return;
    }

    if (result.status === "failure") {
      logger.info("Scenario playback failed, starting recovery...");
      ScenarioReporter.recovering();
      await this.#recover({
        text,
        file,
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

  async #recover(props: Runner.RecoverProps) {
    const { text, file, logs } = props;

    const recorder = new ScenarioRecorder({
      text,
      path: this.#path,
      recovery: { session: file.session, logs },
    });

    return this.#recordWith(recorder);
  }

  async #recordWith(recorder: ScenarioRecorder) {
    const result = await recorder.record();

    ScenarioReporter.cacheTotal(recorder.lookups);

    if (result.status === "failure") {
      logger.error(`Scenario recording failed: ${result.error}`);
      ScenarioReporter.failed(result.error);
      this.#reportFinished();
      return SystemProcess.exit(1);
    }

    const path = await this.#store.save({
      scenario: recorder.scenario,
      session: result.session,
    });

    logger.info(`Saved scenario recording to ${path}`);
    ScenarioReporter.saved(path, recorder.scenario.steps.length);
  }

  async #readScenarioText(): Promise<string> {
    try {
      return fs.readFile(this.#path, "utf-8");
    } catch (error) {
      logger.error(`Failed to read scenario file at ${this.#path}: ${error}`);
      return SystemProcess.exit(1);
    }
  }
}
