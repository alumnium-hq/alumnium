export function pythonicFormat(
  template: string,
  values: Record<string, unknown>,
): string {
  let output = template;

  for (const [key, value] of Object.entries(values)) {
    output = output.replaceAll(`{${key}}`, String(value));
  }

  return output;
}
