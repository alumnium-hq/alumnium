export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Formats a duration as a human-readable string, e.g. `12.3s`, `1m 47s` or
 * `1h 2m 47s`. Durations under a minute keep sub-second precision, longer ones
 * are rounded to whole seconds.
 *
 * @param ms - Duration in milliseconds.
 * @returns Formatted duration.
 */
export function formatDuration(ms: number): string {
  const clampedMs = Math.max(0, ms);
  const totalSeconds = Math.round(clampedMs / 1000);

  if (totalSeconds < 60) return `${(clampedMs / 1000).toFixed(1)}s`;

  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = hours ? [`${hours}h`, `${minutes}m`] : [`${minutes}m`];
  parts.push(`${seconds}s`);

  return parts.join(" ");
}
