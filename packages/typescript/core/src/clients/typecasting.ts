export type Data =
  | null
  | string
  | number
  | boolean
  | (string | number | boolean)[];

/**
 * Convert string or list of strings to appropriate TypeScript types.
 * Integers outside the safe range remain strings to preserve their exact value.
 */
export function looselyTypecast(value: string | string[]): Data {
  if (Array.isArray(value)) {
    return value.map(
      (item) => looselyTypecast(item) as string | number | boolean,
    );
  }

  const trimmed = value.trim();

  if (trimmed.toUpperCase() === "NOOP") {
    return null;
  } else if (/^\d+$/.test(trimmed)) {
    const number = parseInt(trimmed, 10);
    return Number.isSafeInteger(number) ? number : trimmed;
  } else if (/^\d+\.\d+$/.test(trimmed)) {
    return parseFloat(trimmed);
  } else if (trimmed.toLowerCase() === "true") {
    return true;
  } else if (trimmed.toLowerCase() === "false") {
    return false;
  } else {
    // Strip whitespace and quotes
    return trimmed.replace(/^[\s'"]+|[\s'"]+$/g, "");
  }
}
