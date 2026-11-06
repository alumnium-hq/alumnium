import type { Masker } from "./Masker.ts";

export const DEFAULT_ALUMNIUM_SERVER = "alumnium";
export const ALUMNIUM_START_TOOL = "start";

/**
 * Masker props a run against Alumnium's MCP server needs on top of the host's.
 * Recording and replay must mask with the same props, or a replay would not
 * derive the masks its recording holds.
 *
 * @param props - Host's masker props.
 * @param server - Name the host gave Alumnium's MCP server.
 * @returns Masker props.
 */
export function alumniumMaskerProps(
  props: Masker.Props,
  server: string = DEFAULT_ALUMNIUM_SERVER,
): Masker.Props {
  return {
    ...props,
    registerResponsePaths: {
      ...alumniumRegisterResponsePaths(server),
      ...props.registerResponsePaths,
    },
    // Alumnium's goals and statements are prose an LLM reads, which takes
    // its values from `params`.
    wholeValueOnlyTools: [`${server}/*`, ...(props.wholeValueOnlyTools ?? [])],
  };
}

/**
 * Response paths of Alumnium's own tools worth registering: only the driver
 * id a `start` returns. Every other output is the outcome of the call,
 * re-produced by replaying it, and its small values - seconds waited, token
 * counts - would otherwise take the mask of a value a later non-Alumnium call
 * produces, since the earliest call's mask wins.
 *
 * @param server - Name the host gave Alumnium's MCP server.
 * @returns `registerResponsePaths` for Alumnium's tools.
 */
function alumniumRegisterResponsePaths(
  server: string,
): Record<string, string[]> {
  return {
    [`${server}/*`]: [],
    [`${server}/${ALUMNIUM_START_TOOL}`]: ["id"],
  };
}
