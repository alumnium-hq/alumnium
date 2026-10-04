import { beforeEach, describe, expect, it, vi } from "vitest";
import { MaestroSession } from "./MaestroSession.ts";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  callTool: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  openSimulator: vi.fn(async (_device: string, _headless?: boolean) => {}),
  closeSimulator: vi.fn(async () => {}),
}));

vi.mock("@modelcontextprotocol/sdk/client/index.js", () => ({
  Client: class {
    connect = mocks.connect;
    close = mocks.close;
    callTool = mocks.callTool;
  },
}));

vi.mock("@modelcontextprotocol/sdk/client/stdio.js", () => ({
  StdioClientTransport: class {
    stderr = undefined;
  },
}));

vi.mock("./SimulatorWindow.ts", () => ({
  SimulatorWindow: class {
    open = mocks.openSimulator;
    close = mocks.closeSimulator;
  },
}));

describe(MaestroSession, () => {
  beforeEach(() => {
    vi.resetAllMocks();
    devices("ios", "simulator");
  });

  function devices(platform: string, type: string) {
    mocks.callTool.mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            devices: [
              {
                device_id: "device-id",
                name: "Test device",
                platform,
                type,
                connected: true,
              },
            ],
          }),
        },
      ],
    });
  }

  it.each([undefined, false, true])(
    "passes headless=%s to an iOS simulator window and closes it on stop",
    async (headless) => {
      const session = await MaestroSession.start({
        appId: "com.todo",
        headless,
      });
      expect(mocks.openSimulator).toHaveBeenCalledWith(
        "device-id",
        headless ?? false,
      );
      await session.close();
      expect(mocks.close).toHaveBeenCalledOnce();
      expect(mocks.closeSimulator).toHaveBeenCalledOnce();
    },
  );

  it.each([
    ["android", "emulator"],
    ["ios", "physical"],
  ])("does not open Simulator for %s %s devices", async (platform, type) => {
    devices(platform, type);
    const session = await MaestroSession.start({
      appId: "com.todo",
      headless: false,
    });
    expect(mocks.openSimulator).not.toHaveBeenCalled();
    await session.close();
  });

  it("cleans up after device resolution fails", async () => {
    mocks.callTool.mockResolvedValue({
      content: [{ type: "text", text: '{"devices":[]}' }],
    });
    await expect(MaestroSession.start({ appId: "com.todo" })).rejects.toThrow(
      "No connected Maestro device",
    );
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.openSimulator).not.toHaveBeenCalled();
  });

  it("closes Simulator even when disconnecting fails", async () => {
    const session = await MaestroSession.start({ appId: "com.todo" });
    mocks.close.mockRejectedValueOnce(new Error("Disconnect failed"));
    await expect(session.close()).rejects.toThrow("Disconnect failed");
    expect(mocks.closeSimulator).toHaveBeenCalledOnce();
  });
});
