import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { Alumni } from "alumnium";
import { createLlmUsageStats } from "@alumnium/core/internal";
import type { MobileDevice } from "./devices/MobileDevice.ts";
import { McpArtifactsStore } from "./McpArtifactsStore.ts";
import type { McpDriver } from "./mcpDrivers.ts";
import { McpState } from "./McpState.ts";

let al: Alumni;
let device: MobileDevice;
let artifacts: McpArtifactsStore;
const getStats = vi.fn(async () => createLlmUsageStats());
const quit = vi.fn(async () => {});
const close = vi.fn(async () => {});

beforeEach(() => {
  McpState.clear();
  getStats.mockReset().mockResolvedValue(createLlmUsageStats());
  quit.mockReset().mockResolvedValue(undefined);
  close.mockReset().mockResolvedValue(undefined);
  al = { getStats, quit, driver: {} } as unknown as Alumni;
  device = { prepare: vi.fn(), close };
  artifacts = new McpArtifactsStore("test");
  vi.spyOn(artifacts, "writeJson").mockResolvedValue("token-stats.json");
});

afterEach(async () => {
  await McpState.cleanupAllDrivers();
  McpState.clear();
  vi.restoreAllMocks();
});

function register() {
  McpState.registerDriver(
    "test",
    al,
    { close: vi.fn(async () => {}) } as unknown as McpDriver,
    artifacts,
    device,
  );
}

describe("MCP device ownership", () => {
  it("closes the driver before the owned device and deduplicates concurrent stops", async () => {
    register();
    const stopping = McpState.cleanupDriver("test");
    await Promise.all([stopping, McpState.cleanupDriver("test")]);
    expect(quit).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
    expect(quit.mock.invocationCallOrder[0]).toBeLessThan(
      close.mock.invocationCallOrder[0]!,
    );
    expect(() => McpState.getDriverState("test")).toThrow("not found");
  });

  it.each(["stats", "artifacts", "driver"])(
    "still closes the simulator when %s cleanup fails",
    async (phase) => {
      if (phase === "stats")
        getStats.mockRejectedValueOnce(new Error("stats failed"));
      if (phase === "artifacts")
        vi.mocked(artifacts.writeJson).mockRejectedValueOnce(
          new Error("artifacts failed"),
        );
      if (phase === "driver")
        quit.mockRejectedValueOnce(new Error("driver failed"));
      register();
      await expect(McpState.cleanupDriver("test")).rejects.toThrow(
        `${phase} failed`,
      );
      expect(quit).toHaveBeenCalledTimes(1);
      expect(close).toHaveBeenCalledTimes(1);
      expect(() => McpState.getDriverState("test")).toThrow("not found");
    },
  );

  it("waits for in-flight startup before process shutdown cleans up the new driver", async () => {
    const ready = Promise.withResolvers<void>();
    const starting = McpState.startDriver(async () => {
      await ready.promise;
      register();
    });
    const stopping = McpState.cleanupAllDrivers();
    await expect(McpState.startDriver(async () => {})).rejects.toThrow(
      "shutting down",
    );
    expect(close).not.toHaveBeenCalled();
    ready.resolve();
    await starting;
    await stopping;
    expect(quit).toHaveBeenCalledTimes(1);
    expect(close).toHaveBeenCalledTimes(1);
  });

  it("waits for failed startup to release its device", async () => {
    const ready = Promise.withResolvers<void>();
    const starting = McpState.startDriver(async () => {
      try {
        await ready.promise;
        throw new Error("start failed");
      } finally {
        await close();
      }
    });
    const failed = expect(starting).rejects.toThrow("start failed");
    const stopping = McpState.cleanupAllDrivers();
    ready.resolve();
    await failed;
    await stopping;
    expect(close).toHaveBeenCalledTimes(1);
  });
  it.each(["success", "stats", "quit"])(
    "explicitly ends the owned Appium session after %s",
    async (phase) => {
      const deleteSession = vi.fn(async () => {});
      if (phase === "stats")
        getStats.mockRejectedValueOnce(new Error("stats failed"));
      if (phase === "quit")
        quit.mockRejectedValueOnce(new Error("quit failed"));
      McpState.registerDriver(
        "test",
        al,
        { deleteSession } as unknown as McpDriver,
        artifacts,
      );
      const stopping = McpState.cleanupDriver("test");
      if (phase === "success")
        await Promise.all([stopping, McpState.cleanupDriver("test")]);
      else await expect(stopping).rejects.toThrow(`${phase} failed`);
      expect(deleteSession).toHaveBeenCalledTimes(1);
    },
  );
});
