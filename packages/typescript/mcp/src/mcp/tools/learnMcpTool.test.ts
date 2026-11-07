import { describe, expect, it, vi } from "vitest";
import { pushMock } from "../../../../alumnium/tests/unit/mocks.ts";
import { McpState } from "../McpState.ts";
import { learnMcpTool } from "./learnMcpTool.ts";

describe("learnMcpTool", () => {
  it("teaches do", async () => {
    const learn = mockLearn();

    const result = await learnMcpTool.execute({
      id: "test-123",
      kind: "do",
      layer: "product",
      instruction: 'delete "Test" task',
      actions: ['hover "Test" task', 'click "x" button near "Test" task'],
    });

    expect(learn.do).toHaveBeenCalledWith('delete "Test" task', [
      'hover "Test" task',
      'click "x" button near "Test" task',
    ]);
    expect(result).toEqual([
      {
        type: "text",
        text: JSON.stringify({ learned: "do", layer: "product" }),
      },
    ]);
  });

  it.each(["get", "check"] as const)("teaches %s", async (kind) => {
    const learn = mockLearn();

    const result = await learnMcpTool.execute({
      id: "test-123",
      kind,
      layer: "product",
      instruction: "total amount",
      hint: "use the 'Total' row",
    });

    expect(learn[kind]).toHaveBeenCalledWith(
      "total amount",
      "use the 'Total' row",
    );
    expect(result).toEqual([
      {
        type: "text",
        text: JSON.stringify({ learned: kind, layer: "product" }),
      },
    ]);
  });

  it("teaches lessons in a layer", async () => {
    const learn = mockLearn();

    const result = await learnMcpTool.execute({
      id: "test-123",
      kind: "do",
      layer: "android",
      instruction: "log in",
      actions: ["tap 'Login'"],
    });

    expect(learn.on).toHaveBeenCalledWith("android");
    expect(learn.androidLayer.do).toHaveBeenCalledWith("log in", [
      "tap 'Login'",
    ]);
    expect(learn.do).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        type: "text",
        text: JSON.stringify({ learned: "do", layer: "android" }),
      },
    ]);
  });

  it("teaches shared lessons", async () => {
    const learn = mockLearn();

    await learnMcpTool.execute({
      id: "test-123",
      kind: "check",
      layer: "shared",
      instruction: "banner is gone",
      hint: "no 'Accept' button",
    });

    expect(learn.sharedLayer.check).toHaveBeenCalledWith(
      "banner is gone",
      "no 'Accept' button",
    );
  });

  it("requires actions for do", async () => {
    const learn = mockLearn();

    const result = await learnMcpTool.execute({
      id: "test-123",
      kind: "do",
      layer: "product",
      instruction: 'delete "Test" task',
      hint: "hover first",
    });

    expect(learn.do).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        type: "text",
        text: JSON.stringify({
          error: "actions are required when learning `do`",
        }),
      },
    ]);
  });

  it.each(["get", "check"] as const)("requires hint for %s", async (kind) => {
    const learn = mockLearn();

    const result = await learnMcpTool.execute({
      id: "test-123",
      kind,
      layer: "product",
      instruction: "total amount",
      actions: ["click total"],
    });

    expect(learn[kind]).not.toHaveBeenCalled();
    expect(result).toEqual([
      {
        type: "text",
        text: JSON.stringify({
          error: `hint is required when learning \`${kind}\``,
        }),
      },
    ]);
  });
});

function layer() {
  return {
    do: vi.fn(async () => {}),
    get: vi.fn(async () => {}),
    check: vi.fn(async () => {}),
    forget: vi.fn(async () => true),
  };
}

function mockLearn() {
  const shared = layer();
  const android = layer();
  const learn = Object.assign(layer(), {
    shared: vi.fn(() => shared),
    on: vi.fn(() => android),
  });
  pushMock(
    vi
      .spyOn(McpState, "getDriverAlumni")
      .mockReturnValue({ knowledge: learn } as any),
  );
  return Object.assign(learn, { sharedLayer: shared, androidLayer: android });
}
