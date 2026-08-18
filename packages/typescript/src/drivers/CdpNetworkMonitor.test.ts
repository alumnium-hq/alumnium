import { describe, expect, test, vi } from "vitest";
import { CdpNetworkMonitor } from "./CdpNetworkMonitor.ts";
import { waitForPageStability } from "./CdpNetworkMonitor.ts";

function request(requestId: string, type = "Fetch") {
  return {
    requestId,
    type,
    request: { url: `https://example.com/${requestId}` },
  };
}

describe(CdpNetworkMonitor, () => {
  test("tracks a request until it finishes", () => {
    const monitor = new CdpNetworkMonitor();
    monitor.process("Network.requestWillBeSent", request("1"));
    expect(monitor.pending).toEqual(["https://example.com/1"]);

    monitor.process("Network.loadingFinished", { requestId: "1" });
    expect(monitor.pending).toEqual([]);
  });

  test("namespaces request IDs by session", () => {
    const monitor = new CdpNetworkMonitor();
    monitor.process("Network.requestWillBeSent", request("1"), "main");
    monitor.process("Network.requestWillBeSent", request("1"), "iframe");

    monitor.process("Network.loadingFinished", { requestId: "1" }, "main");
    expect(monitor.pending).toEqual(["https://example.com/1"]);
  });

  test("ignores persistent transports", () => {
    const monitor = new CdpNetworkMonitor();
    monitor.process(
      "Network.requestWillBeSent",
      request("socket", "WebSocket"),
    );
    monitor.process(
      "Network.requestWillBeSent",
      request("events", "EventSource"),
    );
    expect(monitor.pending).toEqual([]);
  });

  test("ignores streaming responses", () => {
    const monitor = new CdpNetworkMonitor();
    monitor.process("Network.requestWillBeSent", request("stream"));
    monitor.process("Network.responseReceived", {
      requestId: "stream",
      response: { mimeType: "text/event-stream", headers: {} },
    });
    expect(monitor.pending).toEqual([]);
  });

  test("rechecks network quiet after evaluating the snapshot", async () => {
    vi.useFakeTimers();
    const monitor = new CdpNetworkMonitor();
    const waiting = waitForPageStability(
      monitor,
      async () => {
        monitor.process("Network.requestWillBeSent", request("fast"));
        monitor.process("Network.loadingFinished", { requestId: "fast" });
        return {
          lastMutationAt: 0,
          now: 100,
          pendingTimeouts: 0,
          readyState: "complete",
        };
      },
      25,
      100,
    );

    await vi.advanceTimersByTimeAsync(100);
    expect((await waiting).loaded).toBe(false);
    vi.useRealTimers();
  });

  test("waits for short timeouts", async () => {
    vi.useFakeTimers();
    const monitor = new CdpNetworkMonitor();
    let pendingTimeouts = 1;
    setTimeout(() => {
      pendingTimeouts = 0;
    }, 50);
    const waiting = waitForPageStability(
      monitor,
      async () => ({
        lastMutationAt: 0,
        now: Date.now(),
        pendingTimeouts,
        readyState: "complete",
      }),
      25,
      100,
    );

    await vi.advanceTimersByTimeAsync(100);
    expect((await waiting).loaded).toBe(true);
    vi.useRealTimers();
  });
});
