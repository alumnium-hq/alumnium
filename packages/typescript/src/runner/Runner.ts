import fs from "node:fs/promises";
import z from "zod";
import { SystemProcess } from "../system/SystemProcess.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { Scenario } from "./Scenario.ts";
import { ScenarioPlayer } from "./ScenarioPlayer.ts";
import { ScenarioRecorder } from "./ScenarioRecorder.ts";
import { ScenariosStore } from "./ScenariosStore.ts";

const { logger } = Telemetry.get(import.meta.url);

export namespace Runner {
  export type ToolArguments = z.infer<typeof Runner.ToolArguments>;

  export type MaskMap = Record<string, string>;
}

export class Runner {
  static ToolArguments = z.record(z.string(), z.unknown());

  #path: string;
  #store = new ScenariosStore();

  constructor(path: string) {
    this.#path = path;
  }

  async run() {
    logger.info(`Running scenario ${this.#path}`);

    const text = await this.#readScenarioText();
    const scenario = await this.#store.lookup(text);

    if (scenario) {
      logger.info(`Scenario ${scenario.id} found in the store, playing...`);
      await this.#play(scenario);
    } else {
      logger.info(`Scenario not found in the store, recording...`);
      await this.#record(text);
    }

    await SystemProcess.exit(0);
  }

  async #play(scenario: Scenario.Type) {
    const player = new ScenarioPlayer(scenario);

    const result = await player.play();

    if (result.status === "failure") return SystemProcess.exit(1);
  }

  async #record(text: string) {
    const recorder = new ScenarioRecorder({
      text,
      path: this.#path,
    });

    await recorder.record(text);

    const path = await this.#store.save(recorder.scenario);

    logger.info(`Saved scenario recording to ${path}`);
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
