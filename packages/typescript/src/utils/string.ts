export function stringExcerpt(str: string, maxLength = 25): string {
  const trimmed = str.trim();
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength)}...`
    : trimmed;
}
