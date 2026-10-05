import { describe, expect, it } from "vitest";
import { checkMcpTool } from "./checkMcpTool.ts";
import { doMcpTool } from "./doMcpTool.ts";

describe("do and check labels", () => {
  it("keeps step and attempt on do", () => {
    const input = doMcpTool.inputSchema.parse({
      id: "1",
      goal: "click login",
      step: 3,
      attempt: 2,
    });
    expect(input).toMatchObject({ step: 3, attempt: 2 });
  });

  it("keeps step on check", () => {
    const input = checkMcpTool.inputSchema.parse({
      id: "1",
      statement: "user is logged in",
      step: 3,
    });
    expect(input).toMatchObject({ step: 3 });
  });

  it("accepts calls without labels", () => {
    expect(
      doMcpTool.inputSchema.safeParse({ id: "1", goal: "click login" }).success,
    ).toBe(true);
  });

  it("rejects non-positive labels", () => {
    expect(
      doMcpTool.inputSchema.safeParse({ id: "1", goal: "x", attempt: 0 })
        .success,
    ).toBe(false);
  });
});
