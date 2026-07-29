import { McpTool } from "../mcp/tools/McpTool.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Scenario } from "./Scenario.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";

const { logger } = Telemetry.get(import.meta.url);

const EXTERNAL_MASK_PREFIX = "<EXTERNAL_";
// NOTE: Anchored, since a mask always takes up a whole tool input value. Path
// segments are sanitized to word characters, so the pattern stays this simple.
const EXTERNAL_MASK_PATTERN = /^<EXTERNAL_\d+_\w+>$/;

const EXTERNAL_PATH_SEPARATOR = "_";
const EXTERNAL_PATH_UNSAFE_PATTERN = /[^A-Za-z0-9]+/g;

export namespace ScenarioMasker {
  export type Map = Record<string, string>;

  /** A scalar leaf collected from an external tool's JSON output. */
  export interface ExternalLeaf {
    path: string[];
    value: string;
  }

  /** Replacement for a string leaf of a tool input, `undefined` to keep it. */
  export type LeafFn = (value: string, path: string) => string | undefined;
}

export class ScenarioMasker {
  #map: ScenarioMasker.Map = {};
  // Mask -> external value, for unmasking.
  #externalValueByMask = new Map<string, string>();
  // External value -> mask, for masking. Keyed by the stringified value, so a
  // JSON number 7 in the output matches a `params` value "7" in the input.
  #maskByExternalValue = new Map<string, string>();

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
   * substitute freshly produced ones.
   *
   * Only a leaf that equals an external value in full is replaced. A value
   * quoted inside a free-form goal is left alone: there is no way to tell a
   * value apart from the prose around it without guessing, and the `do` tool
   * takes such values through `params` anyway.
   *
   * @param input - Tool input to mask.
   * @returns Tool input with external values masked.
   */
  #maskExternalValues(
    input: ScenarioAlumniumMcp.Input,
  ): ScenarioAlumniumMcp.Input {
    if (!this.#maskByExternalValue.size) return input;

    eachStringLeaf(input, (value, path) => {
      const mask = this.#maskByExternalValue.get(value);
      if (!mask) return undefined;

      logger.debug(
        `Masked external value in '${path}': '${value}' -> '${mask}'`,
      );
      return mask;
    });

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
   * NOTE: A mask with no registered value is left in place on purpose, so that
   * `findUnresolvedExternalMasks` can name the input it was needed for.
   *
   * @param input - Masked tool input.
   * @returns Tool input with external value masks replaced.
   */
  #unmaskExternalValues(
    input: ScenarioAlumniumMcp.Input,
  ): ScenarioAlumniumMcp.Input {
    if (!this.#externalValueByMask.size) return input;

    eachStringLeaf(input, (mask, path) => {
      const value = this.#externalValueByMask.get(mask);
      if (value === undefined) return undefined;

      logger.debug(
        `Unmasked external value in '${path}': '${mask}' -> '${value}'`,
      );
      return value;
    });

    return input;
  }

  //#endregion

  //#region External values

  /**
   * Registers values produced by an external tool call, so that they can be
   * masked in the MCP tool inputs that follow it (recording) or substituted back
   * into them (playback).
   *
   * Only JSON output is considered, and masks are derived from the JSON path of
   * each leaf. The same leaf therefore yields the same mask in both phases, even
   * when a fresh output reorders its keys or adds new ones.
   *
   * NOTE: Recording sees the tool result Claude Code produced, playback sees the
   * raw tool output, so a tool whose result Claude Code decorates (`Read`
   * prefixes line numbers, long outputs get truncated) parses as JSON in one
   * phase but not the other. The value is then simply replayed as recorded, and
   * the log below is the only trace of it.
   *
   * @param callIndex - Index of the external tool call within the scenario.
   * @param content - External tool call result content.
   */
  registerExternalOutput(
    callIndex: number,
    content: Scenario.ClaudeCodeStepToolResultContent,
  ) {
    const text = this.#externalOutputText(content).trim();
    if (!text) {
      logger.debug(`External call ${callIndex} produced no text output`);
      return;
    }

    const json = parseJsonStructure(text);
    if (!json) {
      logger.info(
        `External call ${callIndex} output is not a JSON object or array, ignoring it for masking. ` +
          "The values it produced will be replayed as recorded.",
      );
      logger.debug(`-> Output: ${text}`);
      return;
    }

    collectJsonLeaves(json).forEach(({ path, value }) => {
      const mask = externalMask(callIndex, path);

      if (this.#externalValueByMask.has(mask)) {
        // NOTE: Two distinct paths can sanitize to the same mask (`{"a_b": 1}`
        // and `{"a": {"b": 2}}`). The first one wins, in both phases.
        logger.warn(`External mask ${mask} is already registered, skipping`);
        return;
      }

      this.#externalValueByMask.set(mask, value);
      // NOTE: A value produced by several calls keeps the earliest call's mask,
      // so playback substitutes that call's fresh value. Ambiguous by nature.
      if (!this.#maskByExternalValue.has(value))
        this.#maskByExternalValue.set(value, mask);

      logger.debug(`Registered external value ${mask} = '${value}'`);
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
    const masks: string[] = [];

    eachStringLeaf(input, (value) => {
      if (EXTERNAL_MASK_PATTERN.test(value)) masks.push(value);
      return undefined;
    });

    return masks;
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
 * Parses an external tool output as JSON, accepting only an object or an array.
 *
 * NOTE: `JSON.parse` also accepts a bare scalar, so `echo 9` would otherwise
 * register a value with no key to name it - the same guesswork this masking
 * replaced, and inconsistent with `echo nine`, which is not JSON at all.
 *
 * @param text - External tool output text.
 * @returns Parsed JSON structure, `null` when the output is not one.
 */
function parseJsonStructure(text: string): object | null {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }

  if (typeof parsed !== "object" || parsed === null) return null;

  return parsed;
}

/**
 * Collects every scalar leaf of a JSON structure together with its path.
 *
 * @param json - JSON structure to walk.
 * @returns Leaves in traversal order.
 */
function collectJsonLeaves(json: object): ScenarioMasker.ExternalLeaf[] {
  const leaves: ScenarioMasker.ExternalLeaf[] = [];

  const walk = (value: unknown, path: string[]) => {
    if (Array.isArray(value)) {
      value.forEach((item, index) => walk(item, [...path, String(index)]));
      return;
    }

    if (typeof value === "object" && value !== null) {
      for (const [key, nested] of Object.entries(value))
        walk(nested, [...path, key]);
      return;
    }

    // NOTE: Booleans and nulls carry nothing specific to the run that produced
    // them, so a tool input that happens to equal `true` would be a false
    // positive rather than a value worth substituting.
    if (typeof value !== "string" && typeof value !== "number") return;

    const leafValue = String(value);
    if (!leafValue.trim()) return;

    leaves.push({ path, value: leafValue });
  };

  walk(json, []);

  return leaves;
}

/**
 * Builds the mask for a JSON leaf, e.g. `["items", "2", "id"]` of the first
 * external call becomes `<EXTERNAL_0_items_2_id>`.
 *
 * @param callIndex - Index of the external tool call within the scenario.
 * @param path - JSON path of the leaf.
 * @returns Mask to replace the leaf's value with.
 */
function externalMask(callIndex: number, path: string[]): string {
  const maskPath = path
    .map((segment) => segment.replace(EXTERNAL_PATH_UNSAFE_PATTERN, "_"))
    .join(EXTERNAL_PATH_SEPARATOR);

  return `${EXTERNAL_MASK_PREFIX}${callIndex}_${maskPath}>`;
}

/**
 * Visits every string leaf of a tool input, at any nesting depth, so that the
 * values inside e.g. `do`'s `params` are covered too.
 *
 * NOTE: Only string leaves are visited. Substituting a mask into a number or a
 * boolean leaf would change its type and can break the MCP tool input schema.
 *
 * @param container - Value to walk, only objects and arrays are descended into.
 * @param mapLeaf - Called with each string leaf and its path, returning the
 *   replacement for it or `undefined` to leave it alone.
 * @param path - Path of `container` itself, used for logging.
 */
function eachStringLeaf(
  container: unknown,
  mapLeaf: ScenarioMasker.LeafFn,
  path = "",
) {
  if (Array.isArray(container)) {
    container.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;

      if (typeof item !== "string")
        return eachStringLeaf(item, mapLeaf, itemPath);

      const mapped = mapLeaf(item, itemPath);
      if (mapped !== undefined) container[index] = mapped;
    });
    return;
  }

  if (typeof container !== "object" || container === null) return;

  for (const [key, value] of Object.entries(container)) {
    const valuePath = path ? `${path}.${key}` : key;

    if (typeof value !== "string") {
      eachStringLeaf(value, mapLeaf, valuePath);
      continue;
    }

    const mapped = mapLeaf(value, valuePath);
    if (mapped !== undefined) Object.assign(container, { [key]: mapped });
  }
}
