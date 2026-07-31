import { beforeEach, describe, expect, it, vi } from "vitest";
import { sleep } from "../utils/timers.ts";
import { ScenarioExternalMcp } from "./ScenarioExternalMcp.ts";

// The retried server, configured with an exponential back-off.
const SERVER = "qe-test-data-mcp";

const mocks = vi.hoisted(() => ({
  callTool: vi.fn(),
  connect: vi.fn(),
  close: vi.fn(),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    onclose?: () => void;
    connect = mocks.connect;
    callTool = mocks.callTool;
    close = mocks.close;
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class {},
}));

// The back-off is waited out by `retry`, so the tests below only assert on the
// delays it asks for.
vi.mock("../utils/timers.ts", async (importOriginal) => ({
  ...(await importOriginal<typeof import("../utils/timers.ts")>()),
  sleep: vi.fn(() => Promise.resolve()),
}));

function textOutput(text: string, isError = false) {
  return { content: [{ type: "text", text }], ...(isError && { isError }) };
}

function backOffs() {
  return vi.mocked(sleep).mock.calls.map(([ms]) => ms);
}

describe("ScenarioExternalMcp", () => {
  let mcp: ScenarioExternalMcp;

  beforeEach(() => {
    vi.clearAllMocks();
    mcp = new ScenarioExternalMcp();
  });

  it("returns the output of a call that succeeds right away", async () => {
    mocks.callTool.mockResolvedValue(textOutput("guest-1"));

    await expect(mcp.call(SERVER, "createGuest", { x: 1 })).resolves.toEqual(
      textOutput("guest-1"),
    );

    expect(mocks.callTool).toHaveBeenCalledTimes(1);
    expect(mocks.callTool).toHaveBeenCalledWith({
      name: "createGuest",
      arguments: { x: 1 },
    });
    expect(backOffs()).toEqual([]);
  });

  it("retries a thrown error until the call succeeds", async () => {
    mocks.callTool
      .mockRejectedValueOnce(new Error("connection closed"))
      .mockRejectedValueOnce(new Error("connection closed"))
      .mockResolvedValue(textOutput("guest-1"));

    await expect(mcp.call(SERVER, "createGuest", {})).resolves.toEqual(
      textOutput("guest-1"),
    );

    expect(mocks.callTool).toHaveBeenCalledTimes(3);
    expect(backOffs()).toEqual([1000, 3000]);
  });

  it("retries an error result until the call succeeds", async () => {
    mocks.callTool
      .mockResolvedValueOnce(textOutput("backend unavailable", true))
      .mockResolvedValue(textOutput("guest-1"));

    await expect(mcp.call(SERVER, "createGuest", {})).resolves.toEqual(
      textOutput("guest-1"),
    );

    expect(mocks.callTool).toHaveBeenCalledTimes(2);
    expect(backOffs()).toEqual([1000]);
  });

  it("backs off exponentially before giving up on a thrown error", async () => {
    mocks.callTool.mockRejectedValue(new Error("connection closed"));

    await expect(mcp.call(SERVER, "createGuest", {})).rejects.toThrow(
      "connection closed",
    );

    expect(mocks.callTool).toHaveBeenCalledTimes(3);
    expect(backOffs()).toEqual([1000, 3000]);
  });

  it("returns the last error result once the retries are exhausted", async () => {
    mocks.callTool.mockResolvedValue(textOutput("backend unavailable", true));

    await expect(mcp.call(SERVER, "createGuest", {})).resolves.toEqual(
      textOutput("backend unavailable", true),
    );

    expect(mocks.callTool).toHaveBeenCalledTimes(3);
    expect(backOffs()).toEqual([1000, 3000]);
  });

  it("spawns a retried server once", async () => {
    mocks.callTool
      .mockRejectedValueOnce(new Error("timed out"))
      .mockResolvedValue(textOutput("guest-1"));

    await mcp.call(SERVER, "createGuest", {});
    await mcp.call(SERVER, "createHost", {});

    expect(mocks.connect).toHaveBeenCalledTimes(1);
  });

  it("does not retry a server that is not configured", async () => {
    await expect(mcp.call("nope", "createGuest", {})).rejects.toThrow(
      "MCP server 'nope' is not configured for playback",
    );

    expect(mocks.callTool).not.toHaveBeenCalled();
    expect(backOffs()).toEqual([]);
  });
});
