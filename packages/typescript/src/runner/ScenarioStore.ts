import z from "zod";
import { Env } from "../Env.ts";
import { FileStore } from "../FileStore/FileStore.ts";
import { Scenario } from "./Scenario.ts";
import { ScenarioClaudeCodeSessionStore } from "./ScenarioClaudeCodeSessionStore.ts";

export namespace ScenarioStore {
  export type File = z.infer<typeof ScenarioStore.File>;
}

export class ScenarioStore {
  static File = z.object({
    scenario: Scenario.Schema,
    session: z.custom<ScenarioClaudeCodeSessionStore.Snapshot>(
      (value) => value,
    ),
  });

  #store = FileStore.subStore(Env.ALUMNIUM_SCENARIOS_DIR, "scenarios");

  /**
   * Removes a scenario recording file by its ID.
   *
   * @param id - Scenario ID to remove file for.
   * @returns `true` if the file was removed successfully, `false` otherwise.
   */
  remove(id: Scenario.Id): Promise<boolean> {
    return this.#store.removeFile(this.#fileName(id));
  }

  /**
   * Gets a scenario recording file by its ID.
   *
   * @param id - Scenario ID to get.
   * @returns Scenario object if found, `null` otherwise.
   */
  async get(id: Scenario.Id): Promise<ScenarioStore.File | null> {
    return this.#store.readJson(this.#fileName(id), ScenarioStore.File);
  }

  /**
   * Looks up a scenario recording file by its text.
   *
   * @param text - Scenario text to look up.
   * @returns Scenario object if found, `null` otherwise.
   */
  async lookup(text: string): Promise<ScenarioStore.File | null> {
    const id = Scenario.textToId(text);
    return this.#store.readJson(this.#fileName(id), ScenarioStore.File);
  }

  /**
   * Saves a scenario recording in the file store.
   *
   * @param scenario - Scenario recording to save.
   * @returns File path of the saved scenario recording.
   */
  save(file: ScenarioStore.File): Promise<string> {
    return this.#store.writeJson(this.#fileName(file.scenario.id), file);
  }

  #fileName(id: Scenario.Id) {
    return `${id}.json`;
  }
}
