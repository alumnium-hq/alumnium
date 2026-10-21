import { Recording } from "../Recording.ts";

/** Replacement for a string leaf, `undefined` to keep it. */
export type LeafFn = (value: string, path: string) => string | undefined;

/**
 * Visits every string leaf of a value, at any nesting depth, so that the
 * values inside e.g. `do`'s `params` are covered too.
 *
 * Only string leaves are visited. Substituting a mask into a number or a
 * boolean leaf would change its type and can break the tool input schema.
 *
 * @param container - Value to walk, only objects and arrays are descended into.
 * @param mapLeaf - Called with each string leaf and its path, returning the
 *   replacement for it or `undefined` to leave it alone.
 * @param path - Path of `container` itself, used for logging.
 */
export function eachStringLeaf(container: unknown, mapLeaf: LeafFn, path = "") {
  if (Array.isArray(container)) {
    container.forEach((item, index) => {
      const itemPath = `${path}[${index}]`;

      if (typeof item !== "string")
        return eachStringLeaf(item, mapLeaf, itemPath);

      const mapped = mapLeaf(item, itemPath);
      if (mapped !== undefined) container[index] = mapped;
    });
    return;
  }

  if (typeof container !== "object" || container === null) return;

  for (const [key, value] of Object.entries(container)) {
    const valuePath = path ? `${path}.${key}` : key;

    if (typeof value !== "string") {
      eachStringLeaf(value, mapLeaf, valuePath);
      continue;
    }

    const mapped = mapLeaf(value, valuePath);
    if (mapped !== undefined) Object.assign(container, { [key]: mapped });
  }
}

/**
 * Finds every match of a global mask pattern in the string leaves of a value.
 *
 * @param value - Value to scan.
 * @param pattern - Global mask pattern.
 * @returns Matched masks, in order of appearance.
 */
export function findMasks(value: unknown, pattern: RegExp): string[] {
  const masks: string[] = [];

  eachStringLeaf({ value }, (leaf) => {
    masks.push(...(leaf.match(pattern) ?? []));
    return undefined;
  });

  return masks;
}

/**
 * Parses a tool input, cloning it so that masking never touches the caller's
 * own object.
 *
 * @param value - Tool input.
 * @returns Cloned tool input.
 */
export function parseInput(value: unknown): Recording.Input {
  const parseResult = Recording.Input.safeParse(value);
  if (!parseResult.success)
    throw new TypeError("Invalid tool input, expected an object");
  return structuredClone(parseResult.data);
}

export function parseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return undefined;
  }
}

/**
 * Parses a tool output as JSON, accepting only an object or an array.
 *
 * `JSON.parse` also accepts a bare scalar, so `echo 9` would otherwise
 * register a value with no key to name it, inconsistent with `echo nine`,
 * which is not JSON at all.
 *
 * @param text - Tool output text.
 * @returns Parsed JSON structure, `null` when the output is not one.
 */
export function parseJsonStructure(text: string): object | null {
  const parsed = parseJson(text);
  if (typeof parsed !== "object" || parsed === null) return null;
  return parsed;
}

/** Text of a tool result: the string itself, or every text block. */
export function contentTexts(content: Recording.Content): string[] {
  if (typeof content === "string") return [content];
  return content.flatMap((block) =>
    block.type === "text" && typeof block["text"] === "string"
      ? [block["text"]]
      : [],
  );
}

/** Maps the text of a tool result, keeping every other block as it was. */
export function mapTexts(
  content: Recording.Content,
  map: (text: string) => string,
): Recording.Content {
  if (typeof content === "string") return map(content);
  return content.map((block) =>
    block.type === "text" && typeof block["text"] === "string"
      ? { ...block, text: map(block["text"]) }
      : block,
  );
}

/**
 * Tells whether a tool key is one of a set, by its own key or its server's
 * `<server>/*` key.
 *
 * @param keys - Tool keys, see `Recording.toolKey`.
 * @param toolKey - Tool key to look up.
 */
export function hasToolKey(keys: Set<string>, toolKey: string): boolean {
  if (keys.has(toolKey)) return true;

  const separatorIndex = toolKey.lastIndexOf("/");
  return (
    separatorIndex >= 0 && keys.has(`${toolKey.slice(0, separatorIndex)}/*`)
  );
}

/**
 * Sanitizes a segment of a mask - a tool call id or a JSON path segment - to
 * word characters, so that a mask stays matchable by its pattern.
 *
 * @param segment - Segment to sanitize.
 */
export function maskSegment(segment: string): string {
  return segment.replace(/[^A-Za-z0-9_]+/g, "_");
}

const ANY_MASK_PATTERN = /<(?:tool-call|secret|host-var)\.[\w.]+(?::json)?>/g;

/**
 * Maps the parts of a string outside any mask, of any family, leaving the
 * masks themselves intact.
 *
 * @param value - String to map.
 * @param map - Called with each part between masks.
 */
export function mapOutsideMasks(
  value: string,
  map: (text: string) => string,
): string {
  let result = "";
  let index = 0;
  for (const match of value.matchAll(ANY_MASK_PATTERN)) {
    result += map(value.slice(index, match.index)) + match[0];
    index = match.index + match[0].length;
  }
  return result + map(value.slice(index));
}

/** Escapes a string for use as a literal in a `RegExp`. */
export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
