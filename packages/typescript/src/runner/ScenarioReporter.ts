import * as ansi from "picocolors";
import { formatDuration } from "../utils/timers.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";

const THINKING_MAX_LENGTH = 160;
const INPUT_MAX_LENGTH = 120;

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
    this.#print(`  ${label} ${ansi.dim(this.#summarize(input))}`);
  }

  //#endregion

  //#region Playback

  static step(counter: string, name: string, input: unknown) {
    this.#print(
      `  ${ansi.cyan(`→ ${counter} ${name}`)} ${ansi.dim(this.#summarize(input))}`,
    );
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
