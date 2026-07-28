import { McpTool } from "../mcp/tools/McpTool.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Scenario } from "./Scenario.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";

const { logger } = Telemetry.get(import.meta.url);

const EXTERNAL_MASK_PREFIX = "<EXTERNAL_";
const EXTERNAL_MASK_PATTERN = /<EXTERNAL_\d+_\d+>/g;

// NOTE: External output is matched against tool inputs token by token, so short
// prose words would produce false positives ("the" from a file read masking
// "Press the 4 button"). Only value-like tokens are considered: ones containing
// a digit, or long enough to be an identifier rather than a word.
const EXTERNAL_TOKEN_MIN_LENGTH = 8;

export namespace ScenarioMasker {
  export type Map = Record<string, string>;

  export interface ExternalValue {
    mask: string;
    value: string;
  }
}

export class ScenarioMasker {
  #map: ScenarioMasker.Map = {};
  #externalValues: ScenarioMasker.ExternalValue[] = [];

  //#region Masking

  maskInput(input: unknown): ScenarioAlumniumMcp.Input {
    const assertedInput = this.#maskExternalValues(
      ScenarioAlumniumMcp.parseInput(input),
    );

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

  /**
   * Replaces values produced by external tools with masks, so that playback can
   * substitute freshly produced ones. Longer values are masked first, so that a
   * short value cannot corrupt a longer one containing it.
   *
   * @param input - Tool input to mask.
   * @returns Tool input with external values masked.
   */
  #maskExternalValues(
    input: ScenarioAlumniumMcp.Input,
  ): ScenarioAlumniumMcp.Input {
    if (!this.#externalValues.length) return input;

    const sortedValues = [...this.#externalValues].sort(
      (left, right) => right.value.length - left.value.length,
    );

    for (const [key, value] of Object.entries(input)) {
      if (typeof value !== "string") continue;

      let maskedValue = value;
      for (const external of sortedValues) {
        maskedValue = replaceWords(maskedValue, external.value, external.mask);
      }

      if (maskedValue === value) continue;

      logger.debug(
        `Masked external values in '${key}': '${value}' -> '${maskedValue}'`,
      );
      Object.assign(input, { [key]: maskedValue });
    }

    return input;
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
    const unmaskedInput = this.#unmaskExternalValues(
      ScenarioAlumniumMcp.parseInput(input),
    );

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

  /**
   * Substitutes external tool values back into a tool input.
   *
   * @param input - Masked tool input.
   * @returns Tool input with external value masks replaced.
   */
  #unmaskExternalValues(
    input: ScenarioAlumniumMcp.Input,
  ): ScenarioAlumniumMcp.Input {
    if (!this.#externalValues.length) return input;

    for (const [key, value] of Object.entries(input)) {
      if (typeof value !== "string") continue;

      let unmaskedValue = value;
      for (const external of this.#externalValues) {
        unmaskedValue = unmaskedValue.replaceAll(external.mask, external.value);
      }

      if (unmaskedValue === value) continue;

      logger.debug(
        `Unmasked external values in '${key}': '${value}' -> '${unmaskedValue}'`,
      );
      Object.assign(input, { [key]: unmaskedValue });
    }

    return input;
  }

  //#endregion

  //#region External values

  /**
   * Registers values produced by an external tool call, so that they can be
   * masked in the tool inputs that follow it (recording) or substituted back
   * into them (playback). Masks are derived from the call and value positions,
   * so the same call yields the same masks in both phases.
   *
   * @param callIndex - Index of the external tool call within the scenario.
   * @param content - External tool call result content.
   */
  registerExternalOutput(
    callIndex: number,
    content: Scenario.ClaudeCodeStepToolResultContent,
  ) {
    const tokens = this.#tokenizeExternalOutput(content);

    tokens.forEach((token, tokenIndex) => {
      const mask = `${EXTERNAL_MASK_PREFIX}${callIndex}_${tokenIndex}>`;
      this.#externalValues.push({ mask, value: token });
      logger.debug(`Registered external value ${mask} = '${token}'`);
    });
  }

  /**
   * Finds external value masks that unmasking could not resolve, which means
   * the external tool produced fewer values during playback than it did during
   * recording.
   *
   * @param input - Unmasked tool input.
   * @returns Unresolved masks, empty when everything resolved.
   */
  static findUnresolvedExternalMasks(
    input: ScenarioAlumniumMcp.Input,
  ): string[] {
    return Object.values(input).flatMap((value) =>
      typeof value === "string"
        ? [...value.matchAll(EXTERNAL_MASK_PATTERN)].map((match) => match[0])
        : [],
    );
  }

  #tokenizeExternalOutput(
    content: Scenario.ClaudeCodeStepToolResultContent,
  ): string[] {
    return this.#externalOutputText(content)
      .split(/\s+/)
      .filter((token) => this.#isMaskableToken(token));
  }

  #externalOutputText(
    content: Scenario.ClaudeCodeStepToolResultContent,
  ): string {
    if (typeof content === "string") return content;

    if (Array.isArray(content))
      return content
        .flatMap((block) => (block.type === "text" ? [block.text] : []))
        .join("\n");

    content satisfies undefined;
    return "";
  }

  #isMaskableToken(token: string): boolean {
    if (!token) return false;
    return /\d/.test(token) || token.length >= EXTERNAL_TOKEN_MIN_LENGTH;
  }

  //#endregion

  //#region Unmasking

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

/**
 * Replaces whole-word occurrences of a value, so that masking a short value
 * like `4` cannot corrupt `1785192886` or `4.5`.
 */
function replaceWords(
  text: string,
  value: string,
  replacement: string,
): string {
  if (!value) return text;
  const pattern = new RegExp(
    `(?<![\\w.])${escapeRegExp(value)}(?![\\w.])`,
    "g",
  );
  return text.replace(pattern, replacement);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
