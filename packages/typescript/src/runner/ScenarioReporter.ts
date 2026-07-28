import * as ansi from "picocolors";
import { formatDuration } from "../utils/timers.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";

const THINKING_MAX_LENGTH = 160;
const INPUT_MAX_LENGTH = 120;
const DRIVER_ID_KEY = "id";

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
   * call, and once it's gone most tools are left with a single meaningful value
   * (a `do` goal, a `check` statement), which reads better inline than wrapped
   * in JSON.
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

    const soleValue = entries.length === 1 ? entries[0]?.[1] : undefined;
    if (typeof soleValue !== "string")
      return this.#summarize(Object.fromEntries(entries));

    // NOTE: A JSON value (e.g. `start` capabilities) reads better raw than
    // quoted, since it already contains quotes of its own.
    return this.#isJsonLike(soleValue)
      ? this.#summarize(soleValue)
      : `"${this.#collapse(soleValue, INPUT_MAX_LENGTH)}"`;
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
    const collapsed = text.replace(/\s+/g, " ").trim();
    if (collapsed.length <= maxLength) return collapsed;
    return `${collapsed.slice(0, maxLength)}…`;
  }

  static #print(line: string) {
    console.log(line);
  }

  //#endregion
}
