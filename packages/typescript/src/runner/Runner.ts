import fs from "node:fs/promises";
import z from "zod";
import { SystemProcess } from "../system/SystemProcess.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { ScenarioPlayer } from "./ScenarioPlayer.ts";
import { ScenarioRecorder } from "./ScenarioRecorder.ts";
import { ScenarioStore } from "./ScenarioStore.ts";
import ora, { type Ora } from "ora";
import clr from "picocolors";

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

  constructor(path: string) {
    this.#path = path;
  }

  async run() {
    logger.info(`Running scenario ${this.#path}`);

    const text = await this.#readScenarioText();
    const file = await this.#store.lookup(text);

    console.log(`\nTest ${clr.bold(clr.blue(this.#path))}:\n`);

    if (file) {
      logger.info(`Scenario ${file.scenario.id} found in the store, running…`);

      console.log(
        `  ${clr.green("✔")} Found scenario recording ${clr.gray(`(${file.scenario.id})`)}`,
      );
      const initialSpinner = ora({ text: "Running tests…", indent: 2 }).start();

      const finalSpinner = await this.#play(text, file, initialSpinner);

      finalSpinner.succeed("Tests passed");
    } else {
      logger.info("Scenario not found in the store, recording…");

      console.log(`  ${clr.yellow("?")} No scenario recording found`);
      const spinner = ora({ text: "Recording…", indent: 2 }).start();

      await this.#record(text);

      spinner.succeed(clr.green("Tests passed"));
    }

    await SystemProcess.shutdown(0);
  }

  async #play(
    text: string,
    file: ScenarioStore.File,
    initialSpinner: Ora,
  ): Promise<Ora> {
    const player = new ScenarioPlayer(file.scenario);

    const result = await player.play();

    if (result.status === "failure") {
      logger.info("Scenario playback failed, starting recovery...");
      initialSpinner.warn("Scenario playback failed");

      const recoverySpinner = ora({ text: "Recovering…", indent: 2 }).start();

      await this.#recover({
        text,
        file,
        logs: result.logs,
      });

      return recoverySpinner;
    }

    return initialSpinner;
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

    if (result.status === "failure") {
      logger.error(`Scenario recording failed: ${result.error}`);
      return SystemProcess.shutdown(1);
    }

    const path = await this.#store.save({
      scenario: recorder.scenario,
      session: result.session,
    });

    logger.info(`Saved scenario recording to ${path}`);
  }

  async #readScenarioText(): Promise<string> {
    try {
      return fs.readFile(this.#path, "utf-8");
    } catch (error) {
      logger.error(`Failed to read scenario file at ${this.#path}: ${error}`);
      return SystemProcess.shutdown(1);
    }
  }
}
