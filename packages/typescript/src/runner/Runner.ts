import fs from "node:fs/promises";
import z from "zod";
import { SystemProcess } from "../system/SystemProcess.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { ScenarioPlayer } from "./ScenarioPlayer.ts";
import { ScenarioRecorder } from "./ScenarioRecorder.ts";
import { ScenarioStore } from "./ScenarioStore.ts";
import { Spinner } from "picospinner";

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

  export interface RunProps {
    record: boolean;
    recover: boolean;
  }

  export interface PlayProps {
    text: string;
    file: ScenarioStore.File;
    recover: boolean;
    spinner: RunnerSpinner;
  }
}

export class Runner {
  static ToolArguments = z.record(z.string(), z.unknown());

  #path: string;
  #store = new ScenarioStore();

  constructor(path: string) {
    this.#path = path;
  }

  async run(props: Runner.RunProps) {
    logger.info(`Running scenario ${this.#path}`);

    const { record, recover } = props;

    const text = await this.#readScenarioText();
    const file = await this.#store.lookup(text);

    console.log(`\nTest ${clr.bold(clr.blue(this.#path))}:\n`);

    if (file) {
      logger.info(`Scenario ${file.scenario.id} found in the store, running…`);

      console.log(
        `  ${clr.green("✔")} Found scenario recording ${clr.gray(`(${file.scenario.id})`)}`,
      );
      const initialSpinner = new RunnerSpinner("Running tests…");
      initialSpinner.start();

      const finalSpinner = await this.#play({
        text,
        file,
        recover,
        spinner: initialSpinner,
      });

      finalSpinner.succeed("Tests passed");
    } else if (record) {
      logger.info("Scenario not found in the store, recording…");

      console.log(`  ${clr.yellow("?")} No scenario recording found`);
      const spinner = new RunnerSpinner("Recording…");
      spinner.start();

      await this.#record(text);

      spinner.succeed(clr.green("Tests passed"));
    } else {
      logger.warn("Scenario not found in the store");

      console.log(`  ${clr.red("✖")} No scenario recording found`);
      return SystemProcess.shutdown(1);
    }

    await SystemProcess.shutdown(0);
  }

  async #play(props: Runner.PlayProps): Promise<RunnerSpinner> {
    const { text, file, recover, spinner: initialSpinner } = props;
    const player = new ScenarioPlayer(file.scenario);

    const result = await player.play();

    if (result.status !== "failure") return initialSpinner;

    if (recover) {
      logger.info("Scenario playback failed, starting recovery...");
      initialSpinner.warn("Scenario playback failed");

      const recoverySpinner = new RunnerSpinner("Recovering…");
      recoverySpinner.start();

      await this.#recover({
        text,
        file,
        logs: result.logs,
      });

      return recoverySpinner;
    }

    logger.error(`Scenario playback failed: ${result.error}`);
    initialSpinner.fail("Scenario playback failed");

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

export class RunnerSpinner extends Spinner {
  constructor(text: string) {
    super({
      text,
      symbolFormatter: (str) => `  ${str}`,
    });
  }
}
