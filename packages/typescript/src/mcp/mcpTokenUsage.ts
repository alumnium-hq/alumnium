/**
 * @module MCP Token Usage
 * Wire format for reporting the LLM token usage of an Alumnium session.
 *
 * Unlike the cache lookups next door, these totals only exist once the session
 * is over, so they are reported by the `stop` tool alone - in its output, since
 * by then there is no later result whose `_meta` could carry them.
 */

import z from "zod";
import { createLlmUsage, LlmUsage } from "../llm/llmSchema.ts";

/**
 * Key the `stop` tool reports the session token usage under, in its output.
 */
export const MCP_TOKEN_USAGE_OUTPUT_KEY = "token_usage";

/**
 * Key every tool reports the usage of its own call under, in the result `_meta`.
 *
 * NOTE: DNS-prefixed for the same reason `MCP_CACHE_LOOKUPS_META_KEY` is - MCP
 * reserves the unprefixed `_meta` keys for the specification.
 *
 * NOTE: Per-call deltas exist alongside the session totals `stop` reports because
 * a consumer may never see that call. A scenario playback that fails stops where
 * it failed, and the tokens it spent getting there - a re-asked check bypasses the
 * cache and does reach the model - would otherwise go unreported.
 */
export const MCP_TOKEN_USAGE_META_KEY = "alumnium.ai/token-usage";

/**
 * Token usage of an Alumnium session.
 *
 * `cached` is the part of `total` that a cache hit served, so it never reached a
 * model and costs nothing. What was actually billed is the difference.
 */
export const McpTokenUsage = z.object({
  total: LlmUsage,
  cached: LlmUsage,
});

export type McpTokenUsage = z.infer<typeof McpTokenUsage>;

export function createMcpTokenUsage(): McpTokenUsage {
  return { total: createLlmUsage(), cached: createLlmUsage() };
}

/**
 * Reads the token usage of one call from an MCP tool result `_meta` value.
 *
 * @param value - Value stored under `MCP_TOKEN_USAGE_META_KEY`.
 * @returns Usage, or `undefined` when the value is missing or malformed (e.g. a
 *   server old enough to not report it).
 */
export function parseMcpTokenUsage(value: unknown): McpTokenUsage | undefined {
  const parseResult = McpTokenUsage.safeParse(value);
  return parseResult.success ? parseResult.data : undefined;
}

/**
 * Difference between two readings of a session's usage counters, as the usage of
 * whatever happened between them.
 *
 * @param before - Counters before the call.
 * @param after - Counters after the call.
 * @returns The usage, or `undefined` when the call spent nothing.
 */
export function diffMcpTokenUsage(
  before: McpTokenUsage,
  after: McpTokenUsage,
): McpTokenUsage | undefined {
  const usage: McpTokenUsage = {
    total: diffLlmUsage(before.total, after.total),
    cached: diffLlmUsage(before.cached, after.cached),
  };

  const spent = usage.total.total_tokens || usage.cached.total_tokens;
  return spent ? usage : undefined;
}

/**
 * Reads the session token usage from an MCP tool output text.
 *
 * @param text - Tool output text, expected to be a JSON object.
 * @returns Usage, or `undefined` when the text isn't JSON or doesn't report any
 *   (which is every tool but `stop`).
 */
export function parseMcpTokenUsageOutput(
  text: string,
): McpTokenUsage | undefined {
  let output: unknown;
  try {
    output = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (typeof output !== "object" || output === null) return undefined;

  const parseResult = McpTokenUsage.safeParse(
    (output as Record<string, unknown>)[MCP_TOKEN_USAGE_OUTPUT_KEY],
  );

  return parseResult.success ? parseResult.data : undefined;
}

/**
 * Adds one session's usage into a running total, field by field.
 *
 * NOTE: A run can report usage more than once - a playback that fails and
 * recovers stops one driver and then another - and each `stop` reports only its
 * own session, so the totals are summed rather than replaced.
 *
 * @param target - Running total, mutated in place.
 * @param source - Usage to add to it.
 */
export function addMcpTokenUsage(
  target: McpTokenUsage,
  source: McpTokenUsage,
): void {
  addLlmUsage(target.total, source.total);
  addLlmUsage(target.cached, source.cached);
}

function diffLlmUsage(before: LlmUsage, after: LlmUsage): LlmUsage {
  return {
    input_tokens: after.input_tokens - before.input_tokens,
    output_tokens: after.output_tokens - before.output_tokens,
    total_tokens: after.total_tokens - before.total_tokens,
    cache_creation: after.cache_creation - before.cache_creation,
    cache_read: after.cache_read - before.cache_read,
    reasoning: after.reasoning - before.reasoning,
  };
}

function addLlmUsage(target: LlmUsage, source: LlmUsage): void {
  target.input_tokens += source.input_tokens;
  target.output_tokens += source.output_tokens;
  target.total_tokens += source.total_tokens;
  target.cache_creation += source.cache_creation;
  target.cache_read += source.cache_read;
  target.reasoning += source.reasoning;
}
