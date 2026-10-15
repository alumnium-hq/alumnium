import { describe, expect, test, vi } from "vitest";
import { type WaiterSnapshot, waitForPageStability } from "./PageWaiter.ts";

function snapshot(state: Partial<WaiterSnapshot> = {}): WaiterSnapshot {
  return {
    lastMutationAt: 0,
    lastRequestAt: 0,
    now: 100,
    pendingRequests: [],
    pendingTimeouts: 0,
    readyState: "complete",
    ...state,
  };
}

describe(waitForPageStability, () => {
  test("waits for requests reported by the snapshot", async () => {
    vi.useFakeTimers();
    const waiting = waitForPageStability(
      async () => snapshot({ pendingRequests: ["https://example.com/slow"] }),
      25,
      100,
    );

    await vi.advanceTimersByTimeAsync(100);
    expect(await waiting).toEqual({
      loaded: false,
      pending: ["https://example.com/slow"],
    });
    vi.useRealTimers();
  });

  test("waits for the network to stay quiet after a request", async () => {
    vi.useFakeTimers();
    const waiting = waitForPageStability(
      async () => snapshot({ lastRequestAt: 90 }),
      25,
      100,
    );

    await vi.advanceTimersByTimeAsync(100);
    expect((await waiting).loaded).toBe(false);
    vi.useRealTimers();
  });

  test("waits for short timeouts", async () => {
    vi.useFakeTimers();
    let pendingTimeouts = 1;
    setTimeout(() => {
      pendingTimeouts = 0;
    }, 50);
    const waiting = waitForPageStability(
      async () => snapshot({ now: Date.now(), pendingTimeouts }),
      25,
      100,
    );

    await vi.advanceTimersByTimeAsync(100);
    expect((await waiting).loaded).toBe(true);
    vi.useRealTimers();
  });
});
