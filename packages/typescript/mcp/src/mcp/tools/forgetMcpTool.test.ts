import { describe, expect, it, vi } from "vitest";
import { pushMock } from "../../../../alumnium/tests/unit/mocks.ts";
import { McpState } from "../McpState.ts";
import { forgetMcpTool } from "./forgetMcpTool.ts";

describe("forgetMcpTool", () => {
  it("forgets a product lesson", async () => {
    const forget = vi.fn(async () => true);
    mockAlumni({ forget });

    const result = await forgetMcpTool.execute({
      id: "test-123",
      kind: "get",
      instruction: "total amount",
      layer: "product",
    });

    expect(forget).toHaveBeenCalledWith("get", "total amount");
    expect(result).toEqual([
      { type: "text", text: JSON.stringify({ forgotten: true }) },
    ]);
  });

  it("forgets a lesson in a platform layer", async () => {
    const forget = vi.fn(async () => false);
    const on = vi.fn(() => ({ forget }));
    mockAlumni({ forget: vi.fn(), on });

    const result = await forgetMcpTool.execute({
      id: "test-123",
      kind: "do",
      instruction: "log in",
      layer: "ios",
    });

    expect(on).toHaveBeenCalledWith("ios");
    expect(forget).toHaveBeenCalledWith("do", "log in");
    expect(result).toEqual([
      { type: "text", text: JSON.stringify({ forgotten: false }) },
    ]);
  });
});

function mockAlumni(knowledge: Record<string, unknown>) {
  pushMock(
    vi.spyOn(McpState, "getDriverAlumni").mockReturnValue({ knowledge } as any),
  );
}
