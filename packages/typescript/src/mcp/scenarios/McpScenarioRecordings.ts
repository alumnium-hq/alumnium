import { FileStore } from "../../FileStore/FileStore.ts";
import { McpScenario } from "./McpScenario.ts";
import { miscScenariosMcpToolSnippets } from "./tools/scenariosMcpToolsShape.ts";

const snippets = miscScenariosMcpToolSnippets;

export class McpScenarioRecordings {
  #store = FileStore.subStore(
    process.env.ALUMNIUM_MCP_SCENARIOS_DIR,
    "mcp/scenarios",
  );

  /**
   * Removes a scenario recording file by its ID.
   *
   * @param scenarioId - Scenario ID to remove file for.
   * @returns `true` if the file was removed successfully, `false` otherwise.
   */
  remove(scenarioId: McpScenario.ScenarioId): Promise<boolean> {
    return this.#store.removeFile(this.#fileName(scenarioId));
  }

  /**
   * Gets a scenario recording file by its ID.
   *
   * @param scenarioId - Scenario ID to get.
   * @returns Scenario object if found, `null` otherwise.
   */
  async get(
    scenarioId: McpScenario.ScenarioId,
  ): Promise<McpScenario.Scenario | null> {
    return this.#store.readJson(
      this.#fileName(scenarioId),
      McpScenario.Scenario,
    );
  }

  /**
   * Lists all scenario recordings.
   *
   * @returns Array of scenario objects if successful, `null` otherwise.
   */
  async list(): Promise<McpScenario.ScenarioFile[]> {
    const filePaths = await this.#store.listFiles();
    return Promise.all(
      filePaths.map(async (filePath) => {
        const json = await this.#store.readJson(filePath);
        if (!json)
          return this.#scenarioFileFailure(
            filePath,
            snippets.scenarioFile.errorRead,
          );

        const parseResult = McpScenario.Scenario.safeParse(json);

        if (!parseResult.success)
          return this.#scenarioFileFailure(
            filePath,
            snippets.scenarioFile.errorParse,
          );

        return this.#scenarioFileSuccess(filePath, parseResult.data);
      }),
    );
  }

  /**
   * Looks up a scenario recording by text.
   *
   * @param text - Text to lookup.
   * @returns Scenario object if found, `null` otherwise.
   */
  async lookup(text: string): Promise<McpScenario.Scenario | null> {
    const trimmedText = text.trim();
    const filePaths = await this.#store.listFiles();
    for (const filePath of filePaths) {
      const scenario = await this.#store.readJson(
        filePath,
        McpScenario.Scenario,
      );
      if (!scenario) continue;
      if (scenario.text === trimmedText) return scenario;
    }
    return null;
  }

  /**
   * Commits a scenario recording, saving it to the file store.
   *
   * @param scenarioId - The scenario ID to commit.
   * @returns File path of the committed scenario.
   */
  commit(recording: McpScenario.Recording): Promise<string> {
    const scenario = recording.scenario;
    return this.#store.writeJson(this.#fileName(scenario.id), scenario);
  }

  #fileName(scenarioId: McpScenario.ScenarioId) {
    return `${scenarioId}.json`;
  }

  #scenarioFileSuccess(
    path: string,
    scenario: McpScenario.Scenario | null,
  ): McpScenario.ScenarioFileSuccess {
    return {
      status: "success",
      path,
      scenario,
    };
  }

  #scenarioFileFailure(
    path: string,
    error: string,
  ): McpScenario.ScenarioFileFailure {
    return {
      status: "failure",
      path,
      error,
    };
  }
}
