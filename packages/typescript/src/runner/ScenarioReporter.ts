import type { TodoWriteInput } from "@anthropic-ai/claude-agent-sdk/sdk-tools";
import * as ansi from "picocolors";
import z from "zod";
import type { CacheLookups } from "../llm/llmSchema.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { formatDuration } from "../utils/timers.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";

const { logger } = Telemetry.get(import.meta.url);

const DRIVER_ID_KEY = "id";
const PARAMS_KEY = "params";

const TODO_TOOL_NAME = "TodoWrite";

// NOTE: The agent calls `ToolSearch` to load the Alumnium MCP tool schemas,
// which is its own plumbing rather than a step of the scenario. `TodoWrite` is
// unreported as a call too, but its input is turned into the group headers the
// steps are printed under. `StructuredOutput` is how the agent hands over the
// pass/fail verdict (see `ScenarioVerdict`), which is reported as the run's
// outcome instead. All three stay in the recording, and in the log.
const UNREPORTED_TOOL_NAMES = new Set([
  "ToolSearch",
  TODO_TOOL_NAME,
  "StructuredOutput",
]);

// NOTE: The statuses come from the SDK type, so that a renamed one is a compile
// error rather than grouping that silently stops working. The schema itself
// keeps `status` a plain string, so that a status added later still leaves the
// known ones working.
type TodoStatus = TodoWriteInput["todos"][number]["status"];

const TODO_IN_PROGRESS: TodoStatus = "in_progress";

const TodoWriteToolInput = z.object({
  todos: z.array(z.object({ content: z.string(), status: z.string() })),
});

/**
 * Prints human-readable scenario progress to the console.
 *
 * NOTE: Logger output normally goes to a file (see `ALUMNIUM_LOG_FILENAME`),
 * so the reporter is the only thing the user sees while a scenario runs.
 */
export abstract class ScenarioReporter {
  // Todo content -> the status it was last reported with, so that a list the
  // agent resends in full only prints what actually changed.
  static #todoStatuses = new Map<string, string>();

  //#region Lifecycle

  /**
   * @param path - Scenario file being tested.
   * @param fileName - Recording file the run will be written to.
   */
  static recording(path: string, fileName: string) {
    this.#todoStatuses.clear();
    this.#print(
      `${ansi.yellow("● testing")} ${path} ${ansi.dim(`(recording to ${fileName})`)}`,
    );
  }

  /**
   * @param path - Scenario file being tested.
   * @param fileName - Recording file the run is played back from.
   */
  static playing(path: string, fileName: string) {
    this.#todoStatuses.clear();
    this.#print(
      `${ansi.green("● testing")} ${path} ${ansi.dim(`(replaying from ${fileName})`)}`,
    );
  }

  static recovering() {
    // NOTE: Recovery re-records from scratch, so the agent starts a fresh todo
    // list - one whose tasks can be worded exactly like the ones just played.
    this.#todoStatuses.clear();
    this.#print(
      `${ansi.yellow("● recovering")} ${ansi.dim("playback failed, re-recording")}`,
    );
  }

  static saved(path: string, stepsCount: number) {
    this.#print(
      `${ansi.green("● saved")} ${path} ${ansi.dim(`(${stepsCount} steps)`)}`,
    );
  }

  /**
   * Prints how a passing run went, as the last word on it - the counterpart of
   * `failed`.
   *
   * @param stepsCount - Steps the scenario is made of.
   * @param details - What the recording agent reported about the run. Playback
   *   has no agent to report it, and falls back to the step count.
   */
  static passed(stepsCount: number, details?: string) {
    const summary = details?.trim()
      ? this.#collapse(details)
      : `${stepsCount} steps`;

    this.#print(`${ansi.green("● passed")} ${summary}`);
  }

  /**
   * @param details - Why the run failed.
   */
  static failed(details: string) {
    this.#print(`${ansi.red("● failed")} ${this.#collapse(details)}`);
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
    const text = this.#collapse(thinking);
    if (!text) return;
    this.#print(ansi.dim(ansi.italic(`✻ ${text}`)));
  }

  static assistant(text: string) {
    const trimmedText = text.trim();
    if (!trimmedText) return;
    this.#print(`${ansi.magenta("✻")} ${trimmedText}`);
  }

  static toolUse(name: string, input: unknown) {
    if (name === TODO_TOOL_NAME) return this.todos(input);
    if (this.#isUnreported(name, input)) return;

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
      ? this.summarizeMcpInput(input)
      : this.#summarize(input);
    this.#print(`${label} ${ansi.dim(summary)}`);
  }

  /**
   * Prints a header for each task the agent starts, so that the steps that
   * follow read as a group. A group stays open until the next task starts, so
   * finishing one prints nothing.
   *
   * NOTE: The agent resends the whole list on every update, so only the tasks
   * whose status changed are printed. Tasks are tracked by their text, which is
   * all that identifies them - reworded task counts as a new one.
   *
   * @param input - `TodoWrite` tool input.
   */
  static todos(input: unknown) {
    const parseResult = TodoWriteToolInput.safeParse(input);
    if (!parseResult.success) {
      logger.debug(`Cannot read the todo list: {input}`, { input });
      return;
    }

    parseResult.data.todos.forEach(({ content, status }) => {
      const reportedStatus = this.#todoStatuses.get(content);
      if (reportedStatus === status) return;

      this.#todoStatuses.set(content, status);

      if (status !== TODO_IN_PROGRESS) return;

      this.#print("");
      this.#print(ansi.bold(content));
    });
  }

  //#endregion

  //#region Tool output

  /**
   * Prints what a tool call returned, in both recording and playback. The
   * Alumnium tools whose output has a known shape get it broken out into one
   * line per part; anything else, including the output of an external tool such
   * as `Bash`, is printed as it came.
   *
   * @param name - Tool name, in either the `mcp__alumnium__do` or the `do` form
   *   for the Alumnium tools, as the agent called it for the rest.
   * @param content - Tool output content.
   */
  static toolResult(name: string, content: unknown) {
    const shortName = ScenarioAlumniumMcp.convertNameFromToolUse(name);
    if (this.#isUnreported(shortName, content)) return;

    ScenarioAlumniumMcp.outputTexts(content).forEach((text) => {
      this.#resultLines(shortName, text).forEach((line) => this.#print(line));
    });
  }

  /**
   * Formats one text block of a tool output.
   *
   * @param name - MCP tool name.
   * @param text - Text block of the output.
   * @returns Lines to print, empty when there is nothing to say.
   */
  static #resultLines(name: string, text: string): string[] {
    const lines =
      name === "do"
        ? this.#doResultLines(text)
        : name === "check"
          ? this.#checkResultLines(text)
          : [];

    if (lines.length) return lines;

    const line = this.#collapse(text);
    return line ? [`${ansi.dim(`← ${line}`)}`] : [];
  }

  /**
   * Breaks a `do` output into the reasoning behind the action, the steps that
   * were actually performed, and how the page changed.
   *
   * @param text - Text block of the output.
   * @returns Lines to print, empty when the output isn't a `do` one.
   */
  static #doResultLines(text: string): string[] {
    const parseResult = ScenarioAlumniumMcp.DoOutput.safeParse(text);
    if (!parseResult.success) return [];

    const { explanation, performed_steps, changes } = parseResult.data;
    const lines: string[] = [];

    const collapsedExplanation = this.#collapse(explanation ?? "");
    if (collapsedExplanation)
      lines.push(`  ${ansi.dim(ansi.italic(`✻ ${collapsedExplanation}`))}`);

    performed_steps?.forEach((step) => {
      const tools = step.tools?.join(", ");
      const suffix = tools ? ` ${ansi.dim(`(${tools})`)}` : "";
      lines.push(`  ${ansi.dim("◈")} ${this.#collapse(step.name)}${suffix}`);
    });

    const collapsedChanges = this.#collapse(changes ?? "");
    if (collapsedChanges) lines.push(`  ${ansi.dim(`± ${collapsedChanges}`)}`);

    return lines;
  }

  /**
   * Reduces a `check` output to its verdict and the reasoning for it.
   *
   * @param text - Text block of the output.
   * @returns Lines to print, empty when the output isn't a `check` one.
   */
  static #checkResultLines(text: string): string[] {
    const parseResult = ScenarioAlumniumMcp.CheckOutput.safeParse(text);
    if (!parseResult.success) return [];

    const { result, explanation } = parseResult.data;
    const marker = result === "success" ? ansi.green("✓") : ansi.red("✗");

    return [`${marker} ${this.#collapse(explanation ?? result)}`];
  }

  //#endregion

  //#region Playback

  static step(name: string, input: unknown) {
    this.#print(
      `${ansi.cyan(`→ ${name}`)} ${ansi.dim(this.summarizeMcpInput(input))}`,
    );
  }

  static externalStep(name: string, input: unknown) {
    if (name === TODO_TOOL_NAME) return this.todos(input);
    if (this.#isUnreported(name, input)) return;

    this.#print(
      `${ansi.yellow(`→ ${name}`)} ${ansi.dim(this.#summarize(input))}`,
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
      `  ${ansi.dim("← cache:")} ${color(label)} ${ansi.dim(`(${lookups.hits}/${total})`)}`,
    );
  }

  static externalStepSkipped(name: string, reason: string) {
    if (this.#isUnreported(name, reason)) return;

    this.#print(`  ${ansi.dim(`- skipped ${name}: ${reason}`)}`);
  }

  /**
   * Notes a `check` that the recording has failing and that passes now.
   *
   * NOTE: The one comparison outcome worth a line of its own. Every tool prints
   * its own output, and a `check` verdict line already says which way it went,
   * so a step agreeing with the recording needs nothing added and a step
   * disagreeing with it is explained by the recovery that follows. This case has
   * neither: the playback carries on past it, so without a line the fact that
   * the recording disagrees would go by unsaid.
   */
  static stepCheckImproved() {
    this.#print(
      `  ${ansi.dim("- passes now, the recording has this check failing")}`,
    );
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
   * NOTE: Public, and color-free, because a summarized call is also how the
   * recovery prompt refers to a step - see `ScenarioRecovery`. Its lines are
   * meant to read like the console ones, so they are built the same way.
   *
   * @param input - MCP tool input.
   * @returns Summarized input.
   */
  static summarizeMcpInput(input: unknown): string {
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
      : `"${this.#collapse(leadValue)}"`;

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

  /**
   * Tells whether a tool is plumbing the user doesn't need to see. It is logged
   * instead, so it can still be found when a run needs explaining.
   *
   * @param name - Tool name as the agent called it.
   * @param details - Whatever the caller was about to print about the tool.
   * @returns `true` when the tool should not be printed.
   */
  static #isUnreported(name: string, details: unknown): boolean {
    if (!ScenarioReporter.isPlumbingTool(name)) return false;

    logger.debug(`Not reporting '${name}' tool: {details}`, { details });
    return true;
  }

  /**
   * Tells whether a tool is the agent's own plumbing rather than a step of the
   * scenario. Such a call is not printed, and it is not something a later run
   * has to be told about either - see `ScenarioRecovery.recordedSteps`.
   *
   * @param name - Tool name as the agent called it.
   * @returns `true` when the tool is plumbing.
   */
  static isPlumbingTool(name: string): boolean {
    return UNREPORTED_TOOL_NAMES.has(name);
  }

  static #isJsonLike(value: string): boolean {
    const trimmedValue = value.trimStart();
    return trimmedValue.startsWith("{") || trimmedValue.startsWith("[");
  }

  static #summarize(value: unknown): string {
    if (value === undefined) return "";
    const json = typeof value === "string" ? value : JSON.stringify(value);
    return this.#collapse(json ?? "");
  }

  /**
   * Puts a value on a single line, so that one call takes up one line however
   * the value happens to be formatted.
   *
   * NOTE: The line is not shortened. A tool input or output is what the user
   * came to see, and the terminal wraps it well enough.
   *
   * @param text - Text to collapse.
   * @returns Text on a single line.
   */
  static #collapse(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  static #print(line: string) {
    console.log(line);
  }

  //#endregion
}
