import { McpTool } from "../mcp/tools/McpTool.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Scenario } from "./Scenario.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";

const { logger } = Telemetry.get(import.meta.url);

export namespace ScenarioMasker {
  export type Map = Record<string, string>;
}

export class ScenarioMasker {
  #map: ScenarioMasker.Map = {};

  //#region Masking

  maskInput(input: unknown): ScenarioAlumniumMcp.Input {
    const assertedInput = ScenarioAlumniumMcp.parseInput(input);

    const inputParseResult = McpTool.WithDriverId.safeParse(assertedInput);
    if (!inputParseResult.success) return assertedInput;

    const { id } = inputParseResult.data;
    const mask = this.#map[id];
    if (!mask) {
      logger.warn(`No driver id mask found for ${id}`);
      return assertedInput;
    }

    return Object.assign(assertedInput, { id: mask });
  }

  maskOutputContent(
    content: Scenario.ClaudeCodeStepToolResultContent,
  ): Scenario.ClaudeCodeStepToolResultContent {
    if (typeof content === "string") {
      return this.#maskOutputJsonString(content);
    }

    if (Array.isArray(content)) {
      return content.map((block) => {
        if (block.type === "text")
          Object.assign(block, {
            text: this.#maskOutputJsonString(block.text),
          });
        return block;
      });
    }

    content satisfies undefined;
    return content;
  }

  #maskOutputJsonString(jsonString: string): string {
    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonString);
    } catch {
      return jsonString;
    }

    const withDriverIdResult = McpTool.WithDriverId.safeParse(parsedJson);
    if (!withDriverIdResult.success) return jsonString;

    const id = withDriverIdResult.data.id;
    const maskedId = this.#newId();
    this.#map[id] = maskedId;

    logger.debug(`Found driver id '${id}', masking it to '${maskedId}'`);

    return JSON.stringify(Object.assign(parsedJson, { id: maskedId }));
  }

  #newId() {
    return `<MASKED_${Object.keys(this.#map).length}>`;
  }

  //#endregion

  //#region Unmasking

  unmaskInput(input: unknown): ScenarioAlumniumMcp.Input {
    const unmaskedInput = ScenarioAlumniumMcp.parseInput(input);

    const withDriverIdResult = McpTool.WithDriverId.safeParse(unmaskedInput);
    if (!withDriverIdResult.success) return unmaskedInput;

    const maskedId = withDriverIdResult.data.id;
    const id = this.#map[maskedId];

    if (!id) {
      logger.warn(`No driver id found for mask ${maskedId}`);
      return unmaskedInput;
    }

    Object.assign(unmaskedInput, { id });
    return unmaskedInput;
  }

  processMcpStartOutputContent(content: ScenarioAlumniumMcp.OutputContent) {
    const id = this.#extractDriverId(content);
    if (!id) return;

    this.#map[this.#newId()] = id;
    logger.debug(
      `Found driver id '${id}' in output, adding it to the mask map`,
    );
  }

  #extractDriverId(content: ScenarioAlumniumMcp.OutputContent): string | null {
    if (typeof content === "string") {
      return this.#extractDriverIdFromJsonString(content);
    }

    if (Array.isArray(content)) {
      for (const block of content) {
        // return content.map((block) => {
        if (block.type !== "text") continue;
        return this.#extractDriverIdFromJsonString(block.text);
      }
    }

    return null;
  }

  #extractDriverIdFromJsonString(jsonString: string): string | null {
    let parsedJson;
    try {
      parsedJson = JSON.parse(jsonString);
    } catch {
      return null;
    }

    const withDriverIdResult = McpTool.WithDriverId.safeParse(parsedJson);
    if (!withDriverIdResult.success) return null;

    return withDriverIdResult.data.id;
  }

  //#endregion
}
