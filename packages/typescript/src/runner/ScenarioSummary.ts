import fs from "node:fs/promises";
import path from "node:path";
import { Env } from "../Env.ts";
import type { CacheLookups } from "../llm/llmSchema.ts";
import type { McpTokenUsage } from "../mcp/mcpTokenUsage.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Scenario } from "./Scenario.ts";
import { ScenarioCost } from "./ScenarioCost.ts";

const { logger } = Telemetry.get(import.meta.url);

export namespace ScenarioSummary {
  /** How the run reached its outcome. */
  export type Mode = "record" | "replay";

  export interface Type {
    /** Scenario file the run tested. */
    scenario: string;
    /** Recording the run played or wrote, `undefined` before there is one. */
    id?: Scenario.Id | undefined;
    mode: Mode;
    /**
     * Whether the playback itself failed - the point a recovery starts from.
     *
     * NOTE: Reported apart from `recovered`, so that the two questions stay
     * separable: this one says the recording no longer replays, which is what a
     * run measuring playback wants to count, and it is true whether or not
     * recovery was allowed to follow. It also tells such a failure apart from a
     * crash, which fails the run without any playback verdict at all.
     */
    playbackFailed: boolean;
    /**
     * Whether a failed playback went on to re-record. Always `false` for a
     * `record` run, which has no playback to fall back from, and for a failed
     * playback with `ALUMNIUM_SCENARIO_RECOVERY` off.
     */
    recovered: boolean;
    passed: boolean;
    durationMs: number;
    /** Executable steps the scenario is made of. */
    stepsCount: number;
    lookups: CacheLookups;
    /** Played checks that only agreed with the recording once re-asked. */
    unstableChecks: number;
    mainAgent: {
      /** `undefined` for a clean playback, which runs no agent at all. */
      usage?: ScenarioCost.MainAgentUsage | undefined;
      costUsd: number;
    };
    alumnium: McpTokenUsage & {
      costUsd: number;
      /** What the cache hits would have cost, had the store not served them. */
      savedUsd: number;
    };
    totalCostUsd: number;
    /** Why the run failed, absent when it passed. */
    error?: string | undefined;
  }

  /** What a run reports about itself, before it is priced. */
  export interface Props extends Omit<
    Type,
    "mainAgent" | "alumnium" | "totalCostUsd"
  > {
    mainAgentUsage?: ScenarioCost.MainAgentUsage | undefined;
    alumniumUsage: McpTokenUsage;
  }
}

/**
 * Machine-readable account of one scenario run.
 *
 * NOTE: The console reporter cannot serve this purpose. A failed run exits before
 * anything could be tallied, and a harness measuring many runs would be parsing
 * lines written for a person - which is why the numbers a run produced are also
 * written as a file, when asked for.
 */
export abstract class ScenarioSummary {
  /**
   * Builds the summary of a run, pricing it along the way.
   *
   * @param props - What the run did.
   * @returns The summary.
   */
  static of(props: ScenarioSummary.Props): ScenarioSummary.Type {
    const { mainAgentUsage, alumniumUsage, ...rest } = props;

    const cost = ScenarioCost.of({
      mainAgent: mainAgentUsage,
      alumnium: alumniumUsage,
    });

    return {
      ...rest,
      mainAgent: { usage: mainAgentUsage, costUsd: cost.mainUsd },
      alumnium: {
        ...alumniumUsage,
        costUsd: cost.alumniumUsd,
        savedUsd: ScenarioCost.alumniumSaved(alumniumUsage),
      },
      totalCostUsd: cost.totalUsd,
    };
  }

  /**
   * Writes the summary to `ALUMNIUM_RUN_SUMMARY_FILE`, if that is set.
   *
   * NOTE: Never throws. This is the last thing a run does, and a summary that
   * cannot be written is not a reason to turn a run that passed into a failure -
   * the console has already reported the outcome. The failure is logged instead.
   *
   * @param summary - Summary to write.
   */
  static async write(summary: ScenarioSummary.Type): Promise<void> {
    const file = Env.ALUMNIUM_RUN_SUMMARY_FILE;
    if (!file) return;

    try {
      await fs.mkdir(path.dirname(file), { recursive: true });
      await fs.writeFile(file, `${JSON.stringify(summary, null, 2)}\n`);
      logger.info(`Wrote scenario run summary to ${file}`);
    } catch (error) {
      logger.error(`Failed to write the run summary to ${file}: {error}`, {
        error,
      });
    }
  }
}
