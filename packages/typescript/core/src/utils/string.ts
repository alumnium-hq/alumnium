export function stringExcerpt(str: string, maxLength = 25): string {
  const trimmed = str.trim();
  return trimmed.length > maxLength
    ? `${trimmed.slice(0, maxLength)}...`
    : trimmed;
}

export function maskString(
  str: string,
  unmaskedStart = 4,
  unmaskedEnd = 4,
): string {
  if (str.length <= unmaskedStart + unmaskedEnd) {
    return "*".repeat(str.length);
  }
  const maskedLength = str.length - unmaskedStart - unmaskedEnd;
  return (
    str.slice(0, unmaskedStart) +
    "*".repeat(maskedLength) +
    str.slice(str.length - unmaskedEnd)
  );
}
