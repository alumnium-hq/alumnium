import * as ansi from "picocolors";
import type { CacheLookups } from "../llm/llmSchema.ts";
import { formatDuration } from "../utils/timers.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";

const THINKING_MAX_LENGTH = 160;
const INPUT_MAX_LENGTH = 120;
const DRIVER_ID_KEY = "id";
const PARAMS_KEY = "params";

/**
 * Prints human-readable scenario progress to the console.
 *
 * NOTE: Logger output normally goes to a file (see `ALUMNIUM_LOG_FILENAME`),
 * so the reporter is the only thing the user sees while a scenario runs.
 */
export abstract class ScenarioReporter {
  //#region Lifecycle

  static recording(path: string) {
    this.#print(
      `${ansi.yellow("● recording")} ${path} ${ansi.dim("(not in the store)")}`,
    );
  }

  static playing(path: string, stepsCount: number) {
    this.#print(
      `${ansi.green("● playing")} ${path} ${ansi.dim(`(${stepsCount} steps)`)}`,
    );
  }

  static recovering() {
    this.#print(
      `${ansi.yellow("● recovering")} ${ansi.dim("playback failed, re-recording")}`,
    );
  }

  static saved(path: string, stepsCount: number) {
    this.#print(
      `${ansi.green("● saved")} ${path} ${ansi.dim(`(${stepsCount} steps)`)}`,
    );
  }

  static passed(stepsCount: number) {
    this.#print(ansi.green(`● passed ${stepsCount} steps`));
  }

  static failed(error: string) {
    this.#print(`${ansi.red("● failed")} ${error}`);
  }

  /**
   * Prints the cache hit rate across all the played steps.
   *
   * @param lookups - Cache lookups the whole scenario made.
   */
  static cacheTotal(lookups: CacheLookups) {
    const total = lookups.hits + lookups.misses;
    if (!total) return;

    const percentage = Math.round((lookups.hits / total) * 100);
    const color = this.#cacheColor(lookups, total);

    this.#print(
      `${color(`● cache hit ${percentage}%`)} ${ansi.dim(`(${lookups.hits}/${total})`)}`,
    );
  }

  static finished(elapsedMs: number) {
    this.#print(`${ansi.dim("● finished in")} ${formatDuration(elapsedMs)}`);
  }

  //#endregion

  //#region Recording

  static thinking(thinking: string) {
    const text = this.#collapse(thinking, THINKING_MAX_LENGTH);
    if (!text) return;
    this.#print(ansi.dim(ansi.italic(`  ✻ ${text}`)));
  }

  static assistant(text: string) {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    this.#print(`  ${ansi.magenta("✻")} ${trimmedText}`);
  }

  static toolUse(name: string, input: unknown) {
    const isOwn = ScenarioAlumniumMcp.isOwnToolUseName(name);
    // NOTE: Only Alumnium MCP tool calls end up in the recording, so other
    // tools the agent uses along the way are dimmed out.
    const shortName = isOwn
      ? ScenarioAlumniumMcp.convertNameFromToolUse(name)
      : name;
    const label = isOwn
      ? ansi.cyan(`→ ${shortName}`)
      : ansi.dim(`→ ${shortName}`);
    const summary = isOwn
      ? this.#summarizeMcpInput(input)
      : this.#summarize(input);
    this.#print(`  ${label} ${ansi.dim(summary)}`);
  }

  //#endregion

  //#region Playback

  static step(counter: string, name: string, input: unknown) {
    this.#print(
      `  ${ansi.cyan(`→ ${counter} ${name}`)} ${ansi.dim(this.#summarizeMcpInput(input))}`,
    );
  }

  static externalStep(counter: string, name: string, input: unknown) {
    this.#print(
      `  ${ansi.yellow(`→ ${counter} ${name}`)} ${ansi.dim(this.#summarize(input))}`,
    );
  }

  /**
   * Prints how much of a step was served from the cache. A step can make
   * several LLM calls (a `do` runs the planner plus an actor call per planned
   * step), so a step can also be a partial hit.
   *
   * @param lookups - Cache lookups the step made.
   */
  static stepCache(lookups: CacheLookups) {
    const total = lookups.hits + lookups.misses;
    if (!total) return;

    const label =
      lookups.hits === total ? "yes" : lookups.hits === 0 ? "no" : "partial";
    const color = this.#cacheColor(lookups, total);

    this.#print(
      `    ${ansi.dim("← cache:")} ${color(label)} ${ansi.dim(`(${lookups.hits}/${total})`)}`,
    );
  }

  static externalStepSkipped(name: string, reason: string) {
    this.#print(`    ${ansi.dim(`- skipped ${name}: ${reason}`)}`);
  }

  static stepMatched(name: string) {
    this.#print(`    ${ansi.green("✓")} ${ansi.dim(`${name} output matches`)}`);
  }

  static stepMismatched(name: string, expected: unknown, actual: unknown) {
    this.#print(`    ${ansi.red("✗")} ${name} output does not match`);
    this.#print(`      ${ansi.dim("expected:")} ${this.#summarize(expected)}`);
    this.#print(`      ${ansi.dim("actual:  ")} ${this.#summarize(actual)}`);
  }

  //#endregion

  //#region Formatting

  /**
   * Summarizes an Alumnium MCP tool input. The driver id is noise in every
   * call, and once it's gone most tools lead with a single meaningful value
   * (a `do` goal, a `check` statement), which reads better quoted inline than
   * wrapped in JSON. Anything left over is appended as a second argument, so a
   * `do` call prints as `"press {digit} button", {"digit":"2"}`.
   *
   * @param input - MCP tool input.
   * @returns Summarized input.
   */
  static #summarizeMcpInput(input: unknown): string {
    if (typeof input !== "object" || input === null)
      return this.#summarize(input);

    const entries = Object.entries(input).filter(
      ([key]) => key !== DRIVER_ID_KEY,
    );

    if (!entries.length) return "";

    const [leadEntry, ...restEntries] = entries;
    const leadValue = leadEntry?.[1];
    if (typeof leadValue !== "string")
      return this.#summarize(Object.fromEntries(entries));

    // NOTE: A JSON value (e.g. `start` capabilities) reads better raw than
    // quoted, since it already contains quotes of its own.
    const lead = this.#isJsonLike(leadValue)
      ? this.#summarize(leadValue)
      : `"${this.#collapse(leadValue, INPUT_MAX_LENGTH)}"`;

    if (!restEntries.length) return lead;

    return `${lead}, ${this.#summarizeRestOfMcpInput(restEntries)}`;
  }

  /**
   * Summarizes the MCP tool input entries following the leading value.
   *
   * @param entries - Remaining input entries.
   * @returns Summarized entries.
   */
  static #summarizeRestOfMcpInput(entries: [string, unknown][]): string {
    // NOTE: `do` params are values for the placeholders in the goal, so they
    // read as a second argument to the goal rather than a nested `params` key.
    const [soleEntry] = entries;
    if (entries.length === 1 && soleEntry?.[0] === PARAMS_KEY)
      return this.#summarize(soleEntry[1]);

    return this.#summarize(Object.fromEntries(entries));
  }

  /**
   * Picks the color for a cache verdict: green when everything was served from
   * the cache, red when nothing was, yellow in between.
   *
   * @param lookups - Cache lookups to color.
   * @param total - Total number of the lookups.
   * @returns Color function.
   */
  static #cacheColor(lookups: CacheLookups, total: number) {
    if (lookups.hits === total) return ansi.green;
    if (lookups.hits === 0) return ansi.red;
    return ansi.yellow;
  }

  static #isJsonLike(value: string): boolean {
    const trimmedValue = value.trimStart();
    return trimmedValue.startsWith("{") || trimmedValue.startsWith("[");
  }

  static #summarize(value: unknown): string {
    if (value === undefined) return "";
    const json = typeof value === "string" ? value : JSON.stringify(value);
    return this.#collapse(json ?? "", INPUT_MAX_LENGTH);
  }

  static #collapse(text: string, maxLength: number): string {
    const collapsed = text.replace(/\s{2,}/g, " ").trim();
    if (collapsed.length <= maxLength) return collapsed;
    return `${collapsed.slice(0, maxLength)}…`;
  }

  static #print(line: string) {
    console.log(line);
  }

  //#endregion
}
