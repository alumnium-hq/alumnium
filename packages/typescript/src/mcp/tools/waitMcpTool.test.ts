import { describe, expect, it, vi } from "vitest";
import { pushMock } from "../../../tests/unit/mocks.ts";
import { AssertionError } from "../../client/errors/AssertionError.ts";
import { sleep } from "../../utils/timers.ts";
import { McpState } from "../McpState.ts";
import { waitMcpTool } from "./waitMcpTool.ts";

vi.mock("../../utils/timers.ts", async () => {
  return {
    sleep: vi.fn(() => Promise.resolve()),
  };
});

describe("waitMcpTool", () => {
  it("waits for given number of seconds", async () => {
    const result = await waitMcpTool.execute({ for: 1, timeout: 10 });
    expect(result).toEqual([{ type: "text", text: "Waited 1 seconds" }]);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("clamps number waits to minimum", async () => {
    const result = await waitMcpTool.execute({ for: 0, timeout: 10 });
    expect(result).toEqual([{ type: "text", text: "Waited 1 seconds" }]);
    expect(sleep).toHaveBeenCalledWith(1000);
  });

  it("clamps number waits to maximum", async () => {
    const result = await waitMcpTool.execute({ for: 100, timeout: 10 });
    expect(result).toEqual([{ type: "text", text: "Waited 30 seconds" }]);
    expect(sleep).toHaveBeenCalledWith(30000);
  });

  it("requires driver_id when waiting for condition", async () => {
    const result = await waitMcpTool.execute({
      for: "user is logged in",
      timeout: 10,
    });
    expect(result).toEqual([
      {
        type: "text",
        text: "driver_id is required when waiting for a condition",
      },
    ]);
  });

  it("returns success when condition is met immediately", async () => {
    const check = mockCheck(async () => "The condition is satisfied");
    const result = await waitMcpTool.execute({
      driver_id: "test-123",
      for: "user is logged in",
      timeout: 10,
    });
    expect(result).toEqual([
      {
        type: "text",
        text: "Condition met: user is logged in\nThe condition is satisfied",
      },
    ]);
    expect(check).toHaveBeenCalledTimes(1);
    expect(check).toHaveBeenCalledWith("user is logged in");
  });

  it("retries until condition is met", async () => {
    const check = mockCheck(async () => "The condition is now satisfied")
      .mockRejectedValueOnce(new AssertionError("Not yet"))
      .mockRejectedValueOnce(new AssertionError("Still not"));
    const result = await waitMcpTool.execute({
      driver_id: "test-123",
      for: "page loaded",
      timeout: 10,
    });
    expect(result).toEqual([
      {
        type: "text",
        text: "Condition met: page loaded\nThe condition is now satisfied",
      },
    ]);
    expect(check).toHaveBeenCalledTimes(3);
    expect(check).toHaveBeenCalledWith("page loaded");
  });

  it("returns timeout message when condition is never met", async () => {
    const check = mockCheck(() => {
      throw new AssertionError("Condition not satisfied");
    });
    const result = await waitMcpTool.execute({
      driver_id: "test-123",
      for: "element visible",
      timeout: 0.001,
    });
    expect(result).toEqual([
      {
        type: "text",
        text: expect.stringContaining(
          "Timeout after 0.001s waiting for: element visible",
        ),
      },
    ]);
    expect(check).toHaveBeenCalledWith("element visible");
  });

  it("rethrows non-assertion errors", async () => {
    mockCheck(() => {
      throw new Error("Connection lost");
    });

    await expect(
      waitMcpTool.execute({
        driver_id: "test-123",
        for: "element visible",
        timeout: 1,
      }),
    ).rejects.toThrow("Connection lost");
  });

  it("uses default timeout when timeout is omitted", async () => {
    const check = mockCheck(async () => "OK");
    const result = await waitMcpTool.execute({
      driver_id: "test-123",
      for: "test condition",
    });
    expect(result).toEqual([
      { type: "text", text: "Condition met: test condition\nOK" },
    ]);
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
