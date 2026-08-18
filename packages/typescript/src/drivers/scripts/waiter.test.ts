import vm from "node:vm";
import { afterEach, describe, expect, test, vi } from "vitest";
import { waiterScriptSource } from "./bundledScripts.ts";

interface WaiterSnapshot {
  pendingTimeouts: number;
}

interface WaiterState {
  snapshot(): WaiterSnapshot;
}

describe("waiter script timeouts", () => {
  afterEach(() => vi.useRealTimers());

  test("tracks short timeouts until they fire or are cleared", () => {
    vi.useFakeTimers();
    const browser = installWaiter();
    browser.setTimeout(() => undefined, 500);
    expect(browser.snapshot().pendingTimeouts).toBe(1);

    vi.advanceTimersByTime(500);
    expect(browser.snapshot().pendingTimeouts).toBe(0);

    const clearedTimeout = browser.setTimeout(() => undefined, 500);
    expect(browser.snapshot().pendingTimeouts).toBe(1);
    browser.clearTimeout(clearedTimeout);
    expect(browser.snapshot().pendingTimeouts).toBe(0);
  });

  test("ignores timeouts over one second", () => {
    vi.useFakeTimers();
    const browser = installWaiter();
    const timeout = browser.setTimeout(() => undefined, 1001);

    expect(browser.snapshot().pendingTimeouts).toBe(0);
    browser.clearTimeout(timeout);
  });

  test("ignores recursive short timeouts after detecting their lineage", () => {
    vi.useFakeTimers();
    const browser = installWaiter();
    let timeout: ReturnType<typeof setTimeout>;
    function poll() {
      timeout = browser.setTimeout(poll, 10);
    }
    timeout = browser.setTimeout(poll, 10);

    expect(browser.snapshot().pendingTimeouts).toBe(1);
    vi.advanceTimersByTime(10);
    expect(browser.snapshot().pendingTimeouts).toBe(0);
    browser.clearTimeout(timeout);
  });

  test("detects recursion by callsite when handlers change", () => {
    vi.useFakeTimers();
    const browser = installWaiter();
    let timeout: ReturnType<typeof setTimeout>;
    function poll() {
      timeout = browser.setTimeout(() => poll(), 10);
    }
    timeout = browser.setTimeout(() => poll(), 10);

    vi.advanceTimersByTime(10);
    expect(browser.snapshot().pendingTimeouts).toBe(1);
    vi.advanceTimersByTime(10);
    expect(browser.snapshot().pendingTimeouts).toBe(0);
    browser.clearTimeout(timeout);
  });
});

function installWaiter() {
  const context = vm.createContext({
    clearTimeout,
    document: { documentElement: {}, readyState: "complete" },
    MutationObserver: class {
      observe() {}
    },
    setTimeout,
    window: { clearTimeout, setTimeout },
  });
  vm.runInContext(waiterScriptSource, context);
  const browser = context.window as {
    clearTimeout: typeof clearTimeout;
    setTimeout: typeof setTimeout;
  };
  const waiter = Reflect.get(browser, Symbol.for("alumnium")) as WaiterState;

  return {
    clearTimeout: browser.clearTimeout,
    setTimeout: browser.setTimeout,
    snapshot: () => waiter.snapshot(),
  };
}
