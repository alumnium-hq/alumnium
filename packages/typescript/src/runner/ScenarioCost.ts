import type { McpTokenUsage } from "../mcp/mcpTokenUsage.ts";

const PER_MTOK = 1_000_000;

// Below this a cost rounds away to `$0.0000`, which reads as free rather than as
// cheap.
const SMALLEST_REPORTED_USD = 0.0001;

export namespace ScenarioCost {
  /** What a run cost, split by which model spent it. */
  export interface Type {
    /** Main agent, which records a scenario and recovers a failed playback. */
    mainUsd: number;
    /** Alumnium's own agents, behind the MCP tools. */
    alumniumUsd: number;
    totalUsd: number;
  }

  /** Prices in USD per million tokens. */
  export interface Pricing {
    input: number;
    output: number;
    cacheWrite5m: number;
    cacheWrite1h: number;
    cacheRead: number;
  }

  /**
   * Token usage of the main agent, as the Claude Code SDK reports it in a result
   * message.
   *
   * NOTE: Structural rather than the SDK's own `NonNullableUsage`, which declares
   * every field non-nullable. They are genuinely absent on a turn that used no
   * cache, and the type saying otherwise is what would hide it.
   */
  export interface MainAgentUsage {
    input_tokens: number;
    output_tokens: number;
    cache_read_input_tokens?: number | undefined;
    cache_creation_input_tokens?: number | undefined;
    cache_creation?:
      | {
          ephemeral_5m_input_tokens?: number | undefined;
          ephemeral_1h_input_tokens?: number | undefined;
        }
      | undefined;
  }

  export interface Props {
    mainAgent?: MainAgentUsage | undefined;
    alumnium: McpTokenUsage;
  }
}

/**
 * Prices a scenario run.
 *
 * NOTE: Priced from the token counts rather than taken from the SDK's own
 * `total_cost_usd`. That figure is a single number for the whole session, and the
 * point here is to tell the main agent's spend apart from Alumnium's - a replay
 * costs nothing on the first and something on the second, which one blended total
 * cannot show.
 */
export abstract class ScenarioCost {
  /** Claude Opus, which the recording and recovery agent runs on. */
  static MAIN_AGENT_PRICING: ScenarioCost.Pricing = {
    input: 5,
    output: 25,
    cacheWrite5m: 6.25,
    cacheWrite1h: 10,
    cacheRead: 0.5,
  };

  /**
   * GPT-5 nano, which Alumnium's agents run on.
   *
   * NOTE: No cache prices. Alumnium's cache is its own response store rather than
   * a provider-side prompt cache, so a hit skips the call altogether and costs
   * nothing at all - see `alumnium`.
   */
  static ALUMNIUM_PRICING = {
    input: 0.05,
    output: 0.4,
  };

  static of(props: ScenarioCost.Props): ScenarioCost.Type {
    const { mainAgent, alumnium } = props;

    const mainUsd = mainAgent ? this.mainAgent(mainAgent) : 0;
    const alumniumUsd = this.alumnium(alumnium);

    return { mainUsd, alumniumUsd, totalUsd: mainUsd + alumniumUsd };
  }

  /**
   * @param usage - Main agent token usage.
   * @returns What it cost, in USD.
   */
  static mainAgent(usage: ScenarioCost.MainAgentUsage): number {
    const pricing = this.MAIN_AGENT_PRICING;
    const creation = usage.cache_creation;
    const write1h = creation?.ephemeral_1h_input_tokens ?? 0;

    // NOTE: Without the per-TTL breakdown there is no telling which writes were
    // which, so all of them are billed at the 5m price - the cheaper of the two,
    // and the default a session gets when it asks for no TTL of its own.
    const write5m =
      creation?.ephemeral_5m_input_tokens ??
      (write1h ? 0 : (usage.cache_creation_input_tokens ?? 0));

    return (
      (usage.input_tokens * pricing.input +
        usage.output_tokens * pricing.output +
        (usage.cache_read_input_tokens ?? 0) * pricing.cacheRead +
        write5m * pricing.cacheWrite5m +
        write1h * pricing.cacheWrite1h) /
      PER_MTOK
    );
  }

  /**
   * Prices what Alumnium's own agents spent.
   *
   * NOTE: `total` alone, and `cached` deliberately not subtracted from it. The two
   * are disjoint counters rather than a total and a part of it: `total` sums what
   * the agents actually received from the model (`Session.stats`), while `cached`
   * is what the response store served instead of calling it (`ServerCache.usage`,
   * accumulated on a hit from the stored generation). A cache hit never reaches
   * the model, so its tokens were never in `total` to begin with - a playback that
   * hit on every lookup reports `total` at zero and `cached` in the thousands.
   * Subtracting would discount tokens that were already free.
   *
   * @param usage - Alumnium session token usage, as `stop` reports it.
   * @returns What it cost, in USD.
   */
  static alumnium(usage: McpTokenUsage): number {
    const pricing = this.ALUMNIUM_PRICING;
    const { total } = usage;

    return (
      (total.input_tokens * pricing.input +
        total.output_tokens * pricing.output) /
      PER_MTOK
    );
  }

  /**
   * What the response store saved, as the cost the run would have paid without
   * it.
   *
   * @param usage - Alumnium session token usage, as `stop` reports it.
   * @returns What the cache hits would have cost, in USD.
   */
  static alumniumSaved(usage: McpTokenUsage): number {
    return this.alumnium({ total: usage.cached, cached: usage.cached });
  }

  /**
   * @param usd - Cost in USD.
   * @returns The cost as it is shown to the user.
   */
  static formatUsd(usd: number): string {
    if (usd && usd < SMALLEST_REPORTED_USD) return `<$${SMALLEST_REPORTED_USD}`;
    return `$${usd.toFixed(4)}`;
  }
}
