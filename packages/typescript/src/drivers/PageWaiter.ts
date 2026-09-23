export const WAITER_SNAPSHOT_SCRIPT =
  "window[Symbol.for('alumnium')]?.snapshot()";

/**
 * Page state reported by the injected waiter script, which tracks DOM
 * mutations, short timers and in-flight requests of the page and its frames.
 */
export interface WaiterSnapshot {
  lastMutationAt: number;
  lastRequestAt: number;
  pendingRequests: string[];
  now: number;
  pendingTimeouts: number;
  readyState: "loading" | "interactive" | "complete";
}

export async function waitForPageStability(
  snapshot: () => Promise<WaiterSnapshot | null>,
  idleMs = 25,
  timeoutMs = 10_000,
): Promise<{ loaded: boolean; pending: string[] }> {
  const startedAt = performance.now();
  const deadline = startedAt + timeoutMs;

  let pending: string[] = [];
  while (performance.now() < deadline) {
    if (performance.now() - startedAt >= idleMs) {
      const state = await snapshot();
      pending = state?.pendingRequests ?? [];
      if (
        state?.readyState === "complete" &&
        state.now - Math.max(state.lastMutationAt, state.lastRequestAt ?? 0) >=
          idleMs &&
        !state.pendingTimeouts &&
        !pending.length
      ) {
        return { loaded: true, pending: [] };
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 10));
  }

  return { loaded: false, pending };
}
