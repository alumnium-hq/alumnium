import { txt } from "smollit";
import type { Scenario } from "./Scenario.ts";
import { ScenarioAlumniumMcp } from "./ScenarioAlumniumMcp.ts";
import type { ScenarioPlayer } from "./ScenarioPlayer.ts";
import { ScenarioReporter } from "./ScenarioReporter.ts";

export namespace ScenarioRecovery {
  export interface Props {
    /** Stale recording whose playback failed. */
    scenario: Scenario.Type;
    /** Why the playback stopped, as the player reported it. */
    error: string;
    /** What the playback got through before it did. */
    logs: ScenarioPlayer.Log[];
  }
}

/**
 * The account of a failed playback a recovery run is given, as the text that
 * goes into its prompt.
 *
 * A recovery used to hand the agent the recorded Claude Code session to resume
 * instead. That session ends on a run of this very scenario that succeeded, and
 * an agent that reads it concludes the work is already done: it re-executes
 * nothing, reports no verdict, and the recovery fails without ever having
 * started. So the stale recording comes in as text, in a fresh session, where it
 * is context rather than history.
 *
 * NOTE: Kept apart from `ScenarioRecorder` so it can be tested. The recorder
 * reaches for `bun` to find the Claude Code binary, and the unit tests run under
 * node, which cannot import it. Same reason as `ScenarioVerdict`.
 */
export abstract class ScenarioRecovery {
  /** Played steps a summary lists, counting back from the failure. */
  static MAX_PLAYED_STEPS = 20;

  /** Recorded steps a summary lists, counting from the first. */
  static MAX_RECORDED_STEPS = 50;

  /** How much of one tool input or output a single line carries. */
  static MAX_LINE_LENGTH = 200;

  /**
   * The recovery block, as the recording prompt carries it.
   *
   * NOTE: This is where the recovery is framed, and the framing is deliberately
   * neutral. A playback stops agreeing with the application either because the
   * recording went stale or because the application broke, and which one it is
   * only the re-run can tell. An instruction to make the scenario pass would
   * have the agent decide that in advance, and a recording that had to be talked
   * into passing is worth less than no recording at all.
   *
   * @param props - The failed playback to recover from.
   * @returns The recovery block.
   */
  static prompt(props: ScenarioRecovery.Props): string {
    const { scenario } = props;

    return ScenarioRecovery.#paragraphs(
      txt(`
        ## Recovering a failed playback

        A saved recording of this scenario exists, and replaying it stopped
        agreeing with the application, so the scenario is being run from
        scratch.

        Run it as written, exactly as you would with no recording at all. What
        follows is context, not a target: it says where the saved run and the
        application stopped agreeing, not which of the two is right.

        If the application does what the scenario says, the run passes and the
        new recording replaces the stale one. If it does not - the check that
        failed on playback fails when you perform it yourself too - then the
        scenario failed: report \`failure\`, and say what you saw.

        Do not continue from the failed playback: the browser session it ran in
        is gone, and nothing has been performed in this session yet. Start the
        scenario at its first step.

        ### How the playback failed
      `),
      ScenarioRecovery.playbackSummary(props),
      txt(`
        ### What the stale recording did

        Reference only, so you can see how the scenario was performed before.
        The application may well have moved on from it, and a step below may be
        the very thing that broke.
      `),
      ScenarioRecovery.recordedSteps(scenario),
    );
  }

  /**
   * Which step the playback stopped on, and what it saw there.
   *
   * @param props - The failed playback to summarize.
   * @returns The summary.
   */
  static playbackSummary(props: ScenarioRecovery.Props): string {
    const { error, logs } = props;

    // NOTE: A step is only logged once it has been called, so a playback that
    // failed before making one - on an unresolved external value, or on a throw
    // - has no failing step to point at, and the error is the whole story.
    const failedLog = logs.findLast((log) => Boolean(log.error));

    return ScenarioRecovery.#paragraphs(
      ScenarioRecovery.#lines(
        `Why it stopped: ${ScenarioRecovery.#collapse(error)}`,
        failedLog && ScenarioRecovery.#failedStep(failedLog),
      ),
      ScenarioRecovery.#playedSteps(logs),
    );
  }

  /**
   * The steps of the stale recording, one line each.
   *
   * NOTE: Inputs only, never outputs. A tool output can be the whole
   * accessibility tree of a page, and a recovery prompt that carried them all
   * would be mostly stale markup - which is what the recorded session it
   * replaces was.
   *
   * @param scenario - Scenario whose recording went stale.
   * @returns The steps, or an empty string when it has none.
   */
  static recordedSteps(scenario: Scenario.Type): string {
    // NOTE: Narration is left out - it is what the recording agent said, and a
    // recovery is a fresh run with its own reasoning to do. So is the agent's
    // plumbing, and `StructuredOutput` above all: it carries the verdict the
    // recorded run signed off with, which is the one thing a recovery must not
    // be handed. Being told the scenario passed last time is what a resumed
    // session amounted to.
    const steps = scenario.steps.filter(
      (step) =>
        step.kind !== "narration" &&
        !ScenarioReporter.isPlumbingTool(step.use.name),
    );
    const shownSteps = steps.slice(0, ScenarioRecovery.MAX_RECORDED_STEPS);
    const omittedCount = steps.length - shownSteps.length;

    return ScenarioRecovery.#lines(
      ...shownSteps.map(
        (step, index) => `${index + 1}. ${ScenarioRecovery.#stepLine(step)}`,
      ),
      omittedCount && `(${omittedCount} later steps left out of this list)`,
    );
  }

  /**
   * What the failing step returned when it was recorded, and what it returns
   * now.
   *
   * @param log - Log of the step the playback stopped on.
   * @returns The comparison.
   */
  static #failedStep(log: ScenarioPlayer.Log): string {
    const { step, mcpOutput } = log;

    return ScenarioRecovery.#lines(
      `The step it stopped on: ${ScenarioRecovery.#stepLine(step)}`,
      `What the recording has for it: ${ScenarioRecovery.#outputLine(step.result.content)}`,
      `What it returned now: ${ScenarioRecovery.#outputLine(mcpOutput.content)}`,
    );
  }

  /**
   * The steps the playback got through, in the order it ran them.
   *
   * @param logs - Logs of the played steps.
   * @returns The steps, or an empty string when none ran.
   */
  static #playedSteps(logs: ScenarioPlayer.Log[]): string {
    if (!logs.length) return "";

    // NOTE: Counted back from the failure rather than forward from the start:
    // what a long scenario failed next to says more about the failure than how
    // it began.
    const shownLogs = logs.slice(-ScenarioRecovery.MAX_PLAYED_STEPS);
    const omittedCount = logs.length - shownLogs.length;

    return ScenarioRecovery.#lines(
      "The steps the playback got through, in order:",
      omittedCount && `(${omittedCount} earlier steps left out of this list)`,
      ...shownLogs.map(
        (log, index) =>
          `${omittedCount + index + 1}. ${ScenarioRecovery.#stepLine(log.step)}`,
      ),
    );
  }

  /**
   * One step as a single line, the way the console prints it.
   *
   * @param step - Step to describe.
   * @returns The step's tool and input.
   */
  static #stepLine(step: Scenario.ClaudeCodeStep): string {
    if (step.kind === "narration")
      return `(said) ${ScenarioRecovery.#line(step.text)}`;

    const { use } = step;
    const isOwn = ScenarioAlumniumMcp.isOwnToolUseName(use.name);
    const name = isOwn
      ? ScenarioAlumniumMcp.convertNameFromToolUse(use.name)
      : use.name;
    // NOTE: An Alumnium call reads as its goal or statement, the way the console
    // shows it. Any other tool has no such shape, so its input goes in as JSON.
    const input = isOwn
      ? ScenarioReporter.summarizeMcpInput(use.input)
      : JSON.stringify(use.input);

    return `${name} ${ScenarioRecovery.#line(input ?? "")}`.trim();
  }

  /**
   * A tool output as a single line.
   *
   * @param content - Tool output content.
   * @returns The output's text.
   */
  static #outputLine(content: unknown): string {
    const text = ScenarioAlumniumMcp.outputTexts(content).join(" ");
    return ScenarioRecovery.#line(text) || "nothing";
  }

  /**
   * Puts a value on one line and shortens it, so that a step takes up a line of
   * the prompt however long its input or output happens to be.
   *
   * @param text - Text to fit on a line.
   * @returns The text, on one line.
   */
  static #line(text: string): string {
    const collapsed = ScenarioRecovery.#collapse(text);
    if (collapsed.length <= ScenarioRecovery.MAX_LINE_LENGTH) return collapsed;

    return `${collapsed.slice(0, ScenarioRecovery.MAX_LINE_LENGTH)}...`;
  }

  static #collapse(text: string): string {
    return text.replace(/\s+/g, " ").trim();
  }

  /**
   * Joins the lines of one block, dropping the ones that have nothing to say.
   *
   * NOTE: `txt` and `txts` cannot be used for a block of lines: they rewrap,
   * joining consecutive lines into one paragraph, which would run a numbered
   * list of steps together into a single line.
   *
   * @param lines - Lines to join.
   * @returns The block.
   */
  static #lines(...lines: (string | number | false | undefined)[]): string {
    return ScenarioRecovery.#join(lines, "\n");
  }

  /**
   * Joins the blocks of the prompt, dropping the empty ones.
   *
   * @param paragraphs - Blocks to join.
   * @returns The prompt.
   */
  static #paragraphs(
    ...paragraphs: (string | number | false | undefined)[]
  ): string {
    return ScenarioRecovery.#join(paragraphs, "\n\n");
  }

  static #join(
    parts: (string | number | false | undefined)[],
    separator: string,
  ): string {
    return parts
      .filter(
        (part): part is string => typeof part === "string" && !!part.trim(),
      )
      .join(separator);
  }
}
