const PATH_SEPARATOR = ".";
const PATH_WILDCARD = "*";
const PATH_DEEP_WILDCARD = "**";
const TOOL_KEY_SEPARATOR = "/";

/**
 * JSON paths into tool call results, by tool key (see `Recording.toolKey`),
 * e.g. `{"test-data/createUser": ["user.token", "sessions.*.id", "**.password"]}`.
 *
 * A path is dot-separated, `*` matches any one key or array index, `**` any
 * number of them (none included), and a path also covers every leaf nested
 * under it. A `<server>/*` key applies to every tool
 * of the server that has no key of its own.
 */
export class ResponsePaths {
  #patterns: Record<string, string[][]>;

  constructor(paths: Record<string, string[]> = {}) {
    this.#patterns = Object.fromEntries(
      Object.entries(paths).map(([key, keyPaths]) => [
        key,
        keyPaths.map((path) => path.split(PATH_SEPARATOR)),
      ]),
    );
  }

  /**
   * Path patterns configured for a tool, its own or its server's.
   *
   * @param toolKey - Tool key, see `Recording.toolKey`.
   * @returns Patterns, `undefined` when the tool has none configured.
   */
  of(toolKey: string | undefined): string[][] | undefined {
    if (!toolKey) return undefined;

    const patterns = this.#patterns[toolKey];
    if (patterns) return patterns;

    const separatorIndex = toolKey.lastIndexOf(TOOL_KEY_SEPARATOR);
    if (separatorIndex < 0) return undefined;

    const server = toolKey.slice(0, separatorIndex);
    return this.#patterns[`${server}${TOOL_KEY_SEPARATOR}${PATH_WILDCARD}`];
  }

  /**
   * Tells whether a tool has any path configured.
   *
   * @param toolKey - Tool key, see `Recording.toolKey`.
   */
  has(toolKey: string | undefined): boolean {
    return !!this.of(toolKey)?.length;
  }

  /**
   * Tells whether a JSON leaf of a tool's result is covered: a pattern covers
   * it when its segments match the start of the leaf path - each one equal to
   * a path segment, `*` matching any one segment and `**` any number of them.
   *
   * @param toolKey - Tool key, see `Recording.toolKey`.
   * @param path - JSON leaf path.
   */
  covers(toolKey: string | undefined, path: string[]): boolean {
    return (this.of(toolKey) ?? []).some((pattern) =>
      this.#matchesStart(pattern, path),
    );
  }

  /**
   * Tells whether a pattern matches the start of a path, see
   * `ResponsePaths.covers`.
   *
   * @param pattern - Pattern segments.
   * @param path - Path segments.
   * @param patternIndex - Pattern segment to match from.
   * @param pathIndex - Path segment to match from.
   */
  #matchesStart(
    pattern: string[],
    path: string[],
    patternIndex = 0,
    pathIndex = 0,
  ): boolean {
    if (patternIndex === pattern.length) return true;

    const segment = pattern[patternIndex];
    if (segment === PATH_DEEP_WILDCARD) {
      for (let index = pathIndex; index <= path.length; index++)
        if (this.#matchesStart(pattern, path, patternIndex + 1, index))
          return true;
      return false;
    }

    if (pathIndex === path.length) return false;
    if (segment !== PATH_WILDCARD && segment !== path[pathIndex]) return false;

    return this.#matchesStart(pattern, path, patternIndex + 1, pathIndex + 1);
  }
}
