/**
 * @module MCP No Cache
 * Wire format for asking an MCP tool call to bypass the LLM response cache.
 *
 * The flag travels in the `tools/call` request's `_meta` rather than in the tool
 * input, so that it stays out of the tool's input schema. A field in the schema
 * is a field the recording agent can see and set, and this exists for the
 * playback (see `ScenarioPlayer`, which re-asks a `check` whose verdict disagrees
 * with its recording) rather than for the agent. It also keeps the flag out of
 * the recorded tool input, where it would be replayed on every later run.
 */

/**
 * NOTE: MCP reserves unprefixed and `modelcontextprotocol.io/*` `_meta` keys
 * for the specification, so our own key has to be DNS-prefixed.
 */
export const MCP_NO_CACHE_META_KEY = "alumnium.ai/no-cache";

/**
 * Builds the request `_meta` that asks a tool to bypass the response cache.
 *
 * @returns Meta object to pass with the call.
 */
export function mcpNoCacheMeta(): Record<string, boolean> {
  return { [MCP_NO_CACHE_META_KEY]: true };
}

/**
 * Reads the cache bypass flag out of a `tools/call` request `_meta`.
 *
 * NOTE: Only an explicit `true` counts. A missing or malformed value leaves the
 * cache on, which is what a caller that knows nothing about the key means - and
 * what makes a server that does know it safe to call from one that doesn't.
 *
 * @param meta - `_meta` of the request.
 * @returns Whether the call is to bypass the cache.
 */
export function parseMcpNoCache(meta: unknown): boolean {
  if (typeof meta !== "object" || meta === null) return false;

  return (meta as Record<string, unknown>)[MCP_NO_CACHE_META_KEY] === true;
}
