import { describe, expect, it, vi } from "vitest";
import { pushMock } from "../../../tests/unit/mocks.ts";
import { AssertionError } from "../../client/errors/AssertionError.ts";
import { sleep } from "../../utils/timers.ts";
import { McpFactory } from "../__factories__/McpFactory.ts";
import { McpState } from "../McpState.ts";
import { waitMcpTool } from "./waitMcpTool.ts";

vi.mock("../../utils/timers.ts", async () => {
  return {
    sleep: vi.fn(() => Promise.resolve()),
  };
});

describe("waitMcpTool", () => {
  it("waits for given number of seconds", async () => {
    const result = await waitMcpTool.execute(
      { for: 1, timeout: 10 },
      McpFactory.createToolExecuteContext(),
    );
    expect(result).toEqual({ waited_seconds: 1 });
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("clamps number waits to minimum", async () => {
    const result = await waitMcpTool.execute(
      { for: 0, timeout: 10 },
      McpFactory.createToolExecuteContext(),
    );
    expect(result).toEqual({ waited_seconds: 1 });
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("clamps number waits to maximum", async () => {
    const result = await waitMcpTool.execute(
      { for: 100, timeout: 10 },
      McpFactory.createToolExecuteContext(),
    );
    expect(result).toEqual({ waited_seconds: 30 });
    expect(sleep).toHaveBeenCalledWith(30000);
  });

  it("requires id when waiting for condition", async () => {
    const result = await waitMcpTool.execute(
      {
        for: "user is logged in",
        timeout: 10,
      },
      McpFactory.createToolExecuteContext(),
    );
    expect(result).toEqual({
      error: "id is required when waiting for a condition",
    });
  });

  it("returns success when condition is met immediately", async () => {
    const check = mockCheck(async () => "The condition is satisfied");
    const result = await waitMcpTool.execute(
      {
        id: "test-123",
        for: "user is logged in",
        timeout: 10,
      },
      McpFactory.createToolExecuteContext(),
    );
    expect(result).toEqual({
      status: "met",
      condition: "user is logged in",
      explanation: "The condition is satisfied",
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith("user is logged in");
  });

  it("retries until condition is met", async () => {
    const check = mockCheck(async () => "The condition is now satisfied")
      .mockRejectedValueOnce(new AssertionError("Not yet"))
      .mockRejectedValueOnce(new AssertionError("Still not"));
    const result = await waitMcpTool.execute(
      {
        id: "test-123",
        for: "page loaded",
        timeout: 10,
      },
      McpFactory.createToolExecuteContext(),
    );
    expect(result).toEqual({
      status: "met",
      condition: "page loaded",
      explanation: "The condition is now satisfied",
    });
    expect(check).toHaveBeenCalledTimes(3);
    expect(check).toHaveBeenCalledWith("page loaded");
  });

  it("returns timeout message when condition is never met", async () => {
    const check = mockCheck(() => {
      throw new AssertionError("Condition not satisfied");
    });
    const result = await waitMcpTool.execute(
      {
        id: "test-123",
        for: "element visible",
        timeout: 0.001,
      },
      McpFactory.createToolExecuteContext(),
    );
    expect(result).toEqual({
      status: "timeout",
      condition: "element visible",
      timeout_seconds: 0.001,
      last_error: "AssertionError: Condition not satisfied",
    });
    expect(check).toHaveBeenCalledWith("element visible");
  });

  it("rethrows non-assertion errors", async () => {
    mockCheck(() => {
      throw new Error("Connection lost");
    });

    await expect(
      waitMcpTool.execute(
        {
          id: "test-123",
          for: "element visible",
          timeout: 1,
        },
        McpFactory.createToolExecuteContext(),
      ),
    ).rejects.toThrow("Connection lost");
  });

  it("uses default timeout when timeout is omitted", async () => {
    const check = mockCheck(async () => "OK");
    const result = await waitMcpTool.execute(
      {
        id: "test-123",
        for: "test condition",
      },
      McpFactory.createToolExecuteContext(),
    );
    expect(result).toEqual({
      status: "met",
      condition: "test condition",
      explanation: "OK",
    });
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith("test condition");
  });
});

function mockCheck(checkFn: (condition: string) => Promise<string>) {
  const checkSpy = vi.fn(checkFn);
  const getDriverSpy = vi.spyOn(McpState, "getDriverAlumni").mockReturnValue({
    check: checkSpy,
  } as any);
  pushMock(getDriverSpy);
  return checkSpy;
}
