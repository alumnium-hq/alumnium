import { afterEach, describe, expect, it, vi } from "vitest";
import type { Alumni } from "../client/Alumni.ts";
import { SystemProcess } from "../system/SystemProcess.ts";
import type { McpArtifactsStore } from "./McpArtifactsStore.ts";
import type { McpDriver } from "./mcpDrivers.ts";
import { McpState } from "./McpState.ts";

describe("McpState", () => {
  afterEach(() => {
    McpState.clear();
    vi.restoreAllMocks();
  });

  it("registers driver cleanup with SystemProcess", () => {
    const useCleanup = vi.spyOn(SystemProcess, "useCleanup");

    McpState.registerDriver(
      "test-driver",
      {} as Alumni,
      {} as McpDriver,
      {} as McpArtifactsStore,
    );

    expect(useCleanup).toHaveBeenCalledOnce();
  });
});
