import { afterEach, describe, expect, it, vi } from "vitest";
import type { Alumni } from "../client/Alumni.ts";
import { createLlmUsageStats } from "../llm/llmSchema.ts";
import type { McpArtifactsStore } from "./McpArtifactsStore.ts";
import { McpState } from "./McpState.ts";
import type { McpDriver } from "./mcpDrivers.ts";

afterEach(() => McpState.clear());

describe("session reservations", () => {
  it("reserves the slot before asynchronous initialization", async () => {
    const ready = Promise.withResolvers<void>();
    const starting = McpState.startDriver(1, () => ready.promise);
    await expect(McpState.startDriver(1, async () => {})).rejects.toThrow(
      "at most 1",
    );
    ready.resolve();
    await starting;
    await expect(McpState.startDriver(1, async () => "new")).resolves.toBe(
      "new",
    );
  });

  it("releases failed starts and preserves the unlimited default", async () => {
    await expect(
      McpState.startDriver(1, async () => {
        throw new Error("launch failed");
      }),
    ).rejects.toThrow("launch failed");
    const ready = Promise.withResolvers<void>();
    const starting = McpState.startDriver(undefined, () => ready.promise);
    await expect(
      McpState.startDriver(undefined, async () => "another"),
    ).resolves.toBe("another");
    ready.resolve();
    await starting;
  });

  it("counts stopping sessions and deduplicates cleanup", async () => {
    const ready = Promise.withResolvers<void>();
    const quit = vi.fn(() => ready.promise);
    register(quit);
    const stopping = McpState.cleanupDriver("session");
    const repeated = McpState.cleanupDriver("session");
    await expect(McpState.startDriver(1, async () => {})).rejects.toThrow(
      "at most 1",
    );
    ready.resolve();
    await Promise.all([stopping, repeated]);
    expect(quit).toHaveBeenCalledTimes(1);
    await expect(
      McpState.startDriver(1, async () => "replacement"),
    ).resolves.toBe("replacement");
  });

  it("cleans the browser even when artifact saving fails", async () => {
    const quit = vi.fn(async () => {});
    register(quit, async () => {
      throw new Error("disk full");
    });
    await expect(McpState.cleanupDriver("session")).rejects.toThrow(
      "disk full",
    );
    expect(quit).toHaveBeenCalledOnce();
    expect(() => McpState.getDriverState("session")).toThrow("not found");
  });

  it("retains failed cleanup slots and prevents reuse after an unregistered cleanup failure", async () => {
    register(async () => {
      throw new Error("browser alive");
    });
    await expect(McpState.cleanupDriver("session")).rejects.toThrow(
      "browser alive",
    );
    await expect(McpState.startDriver(1, async () => {})).rejects.toThrow(
      "at most 1",
    );
    McpState.clear();
    McpState.markCleanupFailed();
    await expect(McpState.startDriver(1, async () => {})).rejects.toThrow(
      "cleanup failed",
    );
  });
});

function register(
  quit: () => Promise<void>,
  writeJson = async () => "stats.json",
) {
  const al = {
    quit,
    getStats: async () => createLlmUsageStats(),
    driver: {},
  } as unknown as Alumni;
  const artifacts = {
    dir: "artifacts",
    writeJson,
  } as unknown as McpArtifactsStore;
  McpState.registerDriver("session", al, {} as McpDriver, artifacts);
}
