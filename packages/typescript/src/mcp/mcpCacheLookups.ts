/**
 * @module MCP Cache Lookups
 * Wire format for reporting cache lookups of an MCP tool call.
 *
 * The counters travel in the tool result's `_meta` rather than its content, so
 * that consumers comparing the content across runs (see `ScenarioPlayer`) don't
 * see the output change depending on the cache state.
 */

import { CacheLookups } from "../llm/llmSchema.ts";

/**
 * NOTE: MCP reserves unprefixed and `modelcontextprotocol.io/*` `_meta` keys
 * for the specification, so our own key has to be DNS-prefixed.
 */
export const MCP_CACHE_LOOKUPS_META_KEY = "alumnium.ai/cache-lookups";

/**
 * Key the `stop` tool reports the session totals under, in its output.
 *
 * NOTE: Output rather than `_meta`, since the recording agent (see
 * `ScenarioRecorder`) only ever sees the tool output — the Claude Code SDK
 * doesn't pass the result `_meta` through to its consumers.
 */
export const MCP_CACHE_LOOKUPS_OUTPUT_KEY = "cache_lookups";

/**
 * Reads cache lookup counters from an MCP tool result `_meta` value.
 *
 * @param value - Value stored under `MCP_CACHE_LOOKUPS_META_KEY`.
 * @returns Counters, or `undefined` when the value is missing or malformed
 *   (e.g. a server old enough to not report them).
 */
export function parseMcpCacheLookups(value: unknown): CacheLookups | undefined {
  const parseResult = CacheLookups.safeParse(value);
  return parseResult.success ? parseResult.data : undefined;
}

/**
 * Reads cache lookup counters from an MCP tool output text.
 *
 * @param text - Tool output text, expected to be a JSON object.
 * @returns Counters, or `undefined` when the text isn't JSON or doesn't report
 *   any (which is every tool but `stop`).
 */
export function parseMcpCacheLookupsOutput(
  text: string,
): CacheLookups | undefined {
  let output: unknown;
  try {
    output = JSON.parse(text);
  } catch {
    return undefined;
  }

  if (typeof output !== "object" || output === null) return undefined;

  return parseMcpCacheLookups(
    (output as Record<string, unknown>)[MCP_CACHE_LOOKUPS_OUTPUT_KEY],
  );
}
