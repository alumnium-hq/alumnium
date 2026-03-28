const keependsRe = /.*(?:\r\n|\r|\n)|.+$/g;
const regularRe = /\r\n|\r|\n/;

export function pythonicSplitlines(text: string, keepends = false): string[] {
  if (text.length === 0) return [];

  if (keepends) {
    // Match "a line plus its line ending", or a final line without ending
    return text.match(keependsRe) ?? [];
  }

  return (
    text
      .split(regularRe)
      // Python drops the final empty element if the string ends with a newline
      .filter((_, i, arr) => i < arr.length - 1 || arr[i] !== "")
  );
}
