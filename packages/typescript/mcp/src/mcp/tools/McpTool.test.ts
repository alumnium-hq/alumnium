import { describe, expect, it, vi } from "vitest";
import { pushMock } from "../../../../alumnium/tests/unit/mocks.ts";
import { McpArtifactsStore } from "../McpArtifactsStore.ts";
import { McpState } from "../McpState.ts";
import { checkMcpTool } from "./checkMcpTool.ts";
import { doMcpTool } from "./doMcpTool.ts";
import { getMcpTool } from "./getMcpTool.ts";
import { McpTool } from "./McpTool.ts";

describe("McpTool", () => {
  it.each([
    [undefined, true],
    [{}, true],
    [{ "alumnium.ai/cache": true }, true],
    [{ "alumnium.ai/cache": "false" }, true],
    [{ "alumnium.ai/cache": false }, false],
  ])("reads cache from meta %j", async (meta, expected) => {
    const execute = vi.fn(async () => []);
    const tool = McpTool.define("test", {
      description: "test",
      inputSchema: McpTool.IdInput,
      execute,
    });

    await tool.execute({ id: "test" }, meta);

    expect(execute).toHaveBeenCalledWith(
      { id: "test" },
      expect.objectContaining({ cache: expected }),
    );
  });

  it.each([
    ["do", doMcpTool, { id: "test", goal: "click login", vision: false }],
    ["check", checkMcpTool, { id: "test", statement: "ok", vision: false }],
    ["get", getMcpTool, { id: "test", data: "title", vision: false }],
  ] as const)("passes cache to %s", async (method, tool, input) => {
    const al = {
      do: vi.fn(async () => ({ explanation: "", steps: [], changes: "" })),
      check: vi.fn(async () => ""),
      get: vi.fn(async () => ""),
    };
    pushMock(
      vi.spyOn(McpState, "getDriverState").mockReturnValue({ al } as any),
      vi.spyOn(McpArtifactsStore, "saveScreenshot").mockResolvedValue(null),
    );

    await tool.execute(input as any, { "alumnium.ai/cache": false });

    expect(al[method]).toHaveBeenCalledWith(expect.any(String), {
      vision: false,
      cache: false,
    });
  });

  it("adds the files an action downloaded to the do result", async () => {
    const al = {
      do: vi.fn(async () => ({ explanation: "Done", steps: [], changes: "" })),
    };
    const downloads = {
      report: vi.fn(async () => ({
        downloads: [{ file: "report.xlsx", bytes: 2048 }],
      })),
    };
    pushMock(
      vi
        .spyOn(McpState, "getDriverState")
        .mockReturnValue({ al, downloads } as any),
      vi.spyOn(McpArtifactsStore, "saveScreenshot").mockResolvedValue(null),
    );

    const [content] = await doMcpTool.execute(
      { id: "test", goal: "click export", vision: false },
      {},
    );

    expect(JSON.parse(content!.text)).toEqual({
      explanation: "Done",
      performed_steps: [],
      downloads: [{ file: "report.xlsx", bytes: 2048 }],
    });
  });
});
