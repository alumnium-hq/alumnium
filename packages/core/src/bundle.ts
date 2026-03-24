declare const BUNDLED: boolean | undefined;

export function isBundled(): boolean {
  try {
    return !!BUNDLED;
  } catch {
    return false;
  }
}
