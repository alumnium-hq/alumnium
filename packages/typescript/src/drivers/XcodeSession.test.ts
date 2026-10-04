import { beforeEach, describe, expect, it, vi } from "vitest";
import { XcodeSession } from "./XcodeSession.ts";

const mocks = vi.hoisted(() => ({
  connect: vi.fn(async () => {}),
  close: vi.fn(async () => {}),
  openSimulator: vi.fn(async (_device: string, _headless?: boolean) => {}),
  closeSimulator: vi.fn(async () => {}),
  callTool: vi.fn<(...args: unknown[]) => Promise<unknown>>(),
  cp: vi.fn(async (_source: string, _target: string, _options: object) => {}),
  mkdtemp: vi.fn(async (_prefix: string) => "/tmp/alumnium-xcode-reset-test"),
  rm: vi.fn(async (_path: string, _options: object) => {}),
  exec: vi.fn(async (_command: string, _args: string[], _options?: object) => ({
    stdout: "com.todo\n",
    stderr: "",
  })),
  transports: [] as {
    command: string;
    args: string[];
    env: Record<string, string>;
  }[],
  readFile: vi.fn(async (_path?: string, encoding?: string) => {
    const source: string =
      "Application bundle identifier: com.todo\nApplication, label: 'Todo'\n  Button, label: 'Add', hitPoint: {30, 40}";
    return encoding ? source : Buffer.from(source);
  }),
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
    constructor(props: (typeof mocks.transports)[number]) {
      mocks.transports.push(props);
    }
  },
}));

vi.mock("node:fs/promises", () => ({
  readFile: mocks.readFile,
  cp: mocks.cp,
  mkdtemp: mocks.mkdtemp,
  rm: mocks.rm,
}));
vi.mock("../utils/process.ts", () => ({ exec: mocks.exec }));
vi.mock("./SimulatorWindow.ts", () => ({
  SimulatorWindow: class {
    open = mocks.openSimulator;
    close = mocks.closeSimulator;
  },
}));

describe(XcodeSession, () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.transports.length = 0;
    mocks.exec.mockImplementation(async (_command, args) => ({
      stdout:
        args[0] === "xcodebuild"
          ? JSON.stringify([
              {
                buildSettings: {
                  PRODUCT_TYPE: "com.apple.product-type.application",
                  PRODUCT_BUNDLE_IDENTIFIER: "com.todo",
                },
              },
            ])
          : args[1] === "get_app_container"
            ? "/simulator/Todo.app\n"
            : "com.todo\n",
      stderr: "",
    }));
    mocks.mkdtemp.mockResolvedValue("/tmp/alumnium-xcode-reset-test");
    mocks.readFile.mockImplementation(async (_path, encoding) => {
      const source =
        "Application bundle identifier: com.todo\nApplication, label: 'Todo'\n  Button, label: 'Add', hitPoint: {30, 40}";
      return encoding ? source : Buffer.from(source);
    });
    mocks.callTool.mockImplementation(async (request) => {
      const name = (request as { name: string }).name;
      if (name === "XcodeOpenWorkspace")
        return result({
          workspaceIdentifier: "workspace1",
          activeScheme: "Todo",
        });
      if (name === "XcodeListSchemes")
        return result({ activeSchemeName: "Todo" });
      if (name.includes("Start"))
        return result({
          interactionSessionKey: "session-key",
          deviceUUID: "device-id",
          deviceIsSimulator: true,
        });
      if (name === "DeviceInteractionSynthesize")
        return result({
          hierarchyPath: "/tmp/hierarchy.txt",
          screenshotPath: "/tmp/screen.png",
        });
      return result({ userMessage: "Done" });
    });
  });

  it("starts an installed app session and closes the device before disconnecting", async () => {
    const session = await XcodeSession.start({
      appId: "com.todo",
      device: "iPhone 16",
    });
    expect(mocks.transports[0]).toMatchObject({
      command: "xcrun",
      args: ["mcpbridge"],
    });
    expect(mocks.exec).toHaveBeenCalledWith(
      "xcrun",
      [
        "simctl",
        "launch",
        "--terminate-running-process",
        "device-id",
        "com.todo",
      ],
      expect.any(Object),
    );
    expect(mocks.callTool).toHaveBeenCalledWith(
      {
        name: "DeviceInteractionStartSession",
        arguments: {
          sessionIdentifier: expect.stringMatching(/^Alumnium /),
          deviceIdentifier: "iPhone 16",
        },
      },
      undefined,
      { timeout: XcodeSession.TOOL_TIMEOUT_MS },
    );
    expect(mocks.callTool).toHaveBeenCalledWith(
      {
        name: "DeviceInteractionSynthesize",
        arguments: {
          interactSessionKey: "session-key",
          activationBundleId: "com.todo",
        },
      },
      undefined,
      { timeout: XcodeSession.TOOL_TIMEOUT_MS },
    );
    await session.close();
    expect(mocks.callTool.mock.calls.at(-1)?.[0]).toEqual({
      name: "DeviceInteractionEndSession",
      arguments: { interactionSessionKey: "session-key" },
    });
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("installs a local app and launches on the resolved device with literal args and environment", async () => {
    const session = await XcodeSession.start({
      appPath: "/tmp/Todo List.app",
      device: "iPhone 17",
      launchArgs: ["-UITesting", "milk's $(echo bread)"],
      launchEnv: { API_URL: "https://staging.example.com", EMPTY: "" },
    });
    expect(mocks.exec.mock.calls.slice(0, 2)).toEqual([
      [
        "/usr/libexec/PlistBuddy",
        ["-c", "Print :CFBundleIdentifier", "/tmp/Todo List.app/Info.plist"],
      ],
      [
        "xcrun",
        ["simctl", "install", "device-id", "/tmp/Todo List.app"],
        { timeout: XcodeSession.TOOL_TIMEOUT_MS },
      ],
    ]);
    expect(mocks.exec).toHaveBeenLastCalledWith(
      "xcrun",
      [
        "simctl",
        "launch",
        "--terminate-running-process",
        "device-id",
        "com.todo",
        "-UITesting",
        "milk's $(echo bread)",
      ],
      {
        env: expect.objectContaining({
          SIMCTL_CHILD_API_URL: "https://staging.example.com",
          SIMCTL_CHILD_EMPTY: "",
        }),
      },
    );
    expect(session.appId).toBe("com.todo");
    expect(mocks.callTool.mock.calls.at(-1)?.[0]).toMatchObject({
      arguments: { activationBundleId: "com.todo" },
    });
  });

  it("passes launch arguments and environment for an already-installed app without a workspace", async () => {
    await XcodeSession.start({
      appId: "com.todo",
      launchArgs: ["-UITesting"],
      launchEnv: { TESTING: "true" },
    });
    expect(mocks.exec).toHaveBeenCalledOnce();
    expect(mocks.exec).toHaveBeenCalledWith(
      "xcrun",
      [
        "simctl",
        "launch",
        "--terminate-running-process",
        "device-id",
        "com.todo",
        "-UITesting",
      ],
      { env: expect.objectContaining({ SIMCTL_CHILD_TESTING: "true" }) },
    );
  });

  it.each([undefined, false])(
    "preserves app data when appReset=%s",
    async (appReset) => {
      await XcodeSession.start({ appId: "com.todo", appReset });
      expect(mocks.exec).toHaveBeenCalledOnce();
      expect(mocks.exec.mock.calls[0]?.[1]?.[1]).toBe("launch");
      expect(mocks.cp).not.toHaveBeenCalled();
    },
  );

  it.each(["bundle id", ".app", ".xcodeproj", ".xcworkspace"])(
    "resets a %s app before its final launch and capture",
    async (kind) => {
      const session = await XcodeSession.start({
        ...(kind === "bundle id"
          ? { appId: "com.todo" }
          : { appPath: `/tmp/Todo${kind}` }),
        appReset: true,
        launchArgs: ["-UITesting"],
        launchEnv: { TESTING: "true" },
      });
      expect(mocks.cp).toHaveBeenCalledWith(
        "/simulator/Todo.app",
        "/tmp/alumnium-xcode-reset-test/Todo.app",
        { recursive: true },
      );
      expect(mocks.exec.mock.calls.slice(-4)).toEqual([
        [
          "xcrun",
          ["simctl", "get_app_container", "device-id", "com.todo", "app"],
        ],
        ["xcrun", ["simctl", "uninstall", "device-id", "com.todo"]],
        [
          "xcrun",
          [
            "simctl",
            "install",
            "device-id",
            "/tmp/alumnium-xcode-reset-test/Todo.app",
          ],
          { timeout: XcodeSession.TOOL_TIMEOUT_MS },
        ],
        [
          "xcrun",
          [
            "simctl",
            "launch",
            "--terminate-running-process",
            "device-id",
            "com.todo",
            "-UITesting",
          ],
          { env: expect.objectContaining({ SIMCTL_CHILD_TESTING: "true" }) },
        ],
      ]);
      const uninstallIndex = mocks.exec.mock.calls.findIndex(
        ([, args]) => args[1] === "uninstall",
      );
      expect(mocks.cp.mock.invocationCallOrder[0]).toBeLessThan(
        mocks.exec.mock.invocationCallOrder[uninstallIndex]!,
      );
      expect(mocks.rm).toHaveBeenCalledWith("/tmp/alumnium-xcode-reset-test", {
        recursive: true,
        force: true,
      });
      expect(mocks.callTool.mock.calls.at(-1)?.[0]).toMatchObject({
        name: "DeviceInteractionSynthesize",
        arguments: { activationBundleId: "com.todo" },
      });
      expect(mocks.exec.mock.invocationCallOrder.at(-1)).toBeLessThan(
        mocks.callTool.mock.invocationCallOrder.at(-1)!,
      );
      expect(session.appId).toBe("com.todo");
    },
  );

  it("does not uninstall if preserving the installed bundle fails", async () => {
    mocks.cp.mockRejectedValueOnce(new Error("Copy failed"));
    await expect(
      XcodeSession.start({ appId: "com.todo", appReset: true }),
    ).rejects.toThrow("Copy failed");
    expect(mocks.exec).toHaveBeenCalledOnce();
    expect(mocks.rm).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each(["get_app_container", "uninstall", "install"])(
    "fails startup and cleans up when reset %s fails",
    async (operation) => {
      mocks.exec.mockImplementation(async (_command, args) => {
        if (args[1] === operation) throw new Error(`${operation} failed`);
        return { stdout: "/simulator/Todo.app\n", stderr: "" };
      });
      await expect(
        XcodeSession.start({ appId: "com.todo", appReset: true }),
      ).rejects.toThrow(`${operation} failed`);
      expect(
        mocks.exec.mock.calls.some(([, args]) => args[1] === "launch"),
      ).toBe(false);
      expect(mocks.rm).toHaveBeenCalledTimes(
        operation === "get_app_container" ? 0 : 1,
      );
      expect(mocks.callTool.mock.calls.at(-1)?.[0]).toMatchObject({
        name: "DeviceInteractionEndSession",
      });
      expect(mocks.close).toHaveBeenCalledOnce();
      expect(mocks.closeSimulator).toHaveBeenCalledOnce();
    },
  );

  it("requires an app to reset", async () => {
    await expect(XcodeSession.start({ appReset: true })).rejects.toThrow(
      "An app is required",
    );
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it("does not reset a project when its bundle id cannot be discovered", async () => {
    mocks.exec.mockResolvedValueOnce({ stdout: "[]", stderr: "" });
    await expect(
      XcodeSession.start({ appPath: "/tmp/Todo.xcodeproj", appReset: true }),
    ).rejects.toThrow("could not uniquely identify");
    expect(mocks.exec).toHaveBeenCalledOnce();
    expect(mocks.cp).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each([true, false])(
    "keeps the project app as its target when SpringBoard is captured (appReset=%s)",
    async (appReset) => {
      mocks.readFile.mockResolvedValue(
        "Application bundle identifier: com.apple.springboard\nApplication, label: 'SpringBoard'",
      );
      const session = await XcodeSession.start({
        appPath: "/tmp/Todo.xcodeproj",
        appReset,
      });
      expect(session.appId).toBe("com.todo");
      expect(mocks.callTool.mock.calls.at(-1)?.[0]).toMatchObject({
        name: "DeviceInteractionSynthesize",
        arguments: { activationBundleId: "com.todo" },
      });
      const uninstallCalls = mocks.exec.mock.calls.filter(
        ([, args]) => args[1] === "uninstall",
      );
      expect(uninstallCalls).toEqual(
        appReset
          ? [["xcrun", ["simctl", "uninstall", "device-id", "com.todo"]]]
          : [],
      );
      await session.capture();
      expect(session.appId).toBe("com.todo");
    },
  );

  it("gets the active scheme if opening the workspace omits it", async () => {
    mocks.callTool.mockResolvedValueOnce(
      result({ workspaceIdentifier: "workspace1" }),
    );
    await XcodeSession.start({
      appPath: "/tmp/Todo.xcodeproj",
      appReset: true,
    });
    expect(mocks.callTool).toHaveBeenCalledWith(
      {
        name: "XcodeListSchemes",
        arguments: { workspaceIdentifier: "workspace1" },
      },
      undefined,
      { timeout: XcodeSession.TOOL_TIMEOUT_MS },
    );
  });

  it("does not reset when the active scheme contains multiple application targets", async () => {
    mocks.exec.mockResolvedValueOnce({
      stdout: JSON.stringify([
        {
          buildSettings: {
            PRODUCT_TYPE: "com.apple.product-type.application",
            PRODUCT_BUNDLE_IDENTIFIER: "com.todo",
          },
        },
        {
          buildSettings: {
            PRODUCT_TYPE: "com.apple.product-type.application",
            PRODUCT_BUNDLE_IDENTIFIER: "com.other",
          },
        },
      ]),
      stderr: "",
    });
    await expect(
      XcodeSession.start({ appPath: "/tmp/Todo.xcodeproj", appReset: true }),
    ).rejects.toThrow("could not uniquely identify");
    expect(mocks.exec).toHaveBeenCalledOnce();
    expect(mocks.cp).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("excludes test bundles from the app's build settings", async () => {
    mocks.exec.mockResolvedValueOnce({
      stdout: JSON.stringify([
        {
          buildSettings: {
            PRODUCT_TYPE: "com.apple.product-type.bundle.unit-test",
            PRODUCT_BUNDLE_IDENTIFIER: "com.todo.tests",
          },
        },
        {
          buildSettings: {
            PRODUCT_TYPE: "com.apple.product-type.application",
            PRODUCT_BUNDLE_IDENTIFIER: "com.todo",
          },
        },
      ]),
      stderr: "",
    });
    const session = await XcodeSession.start({
      appPath: "/tmp/Todo.xcodeproj",
      appReset: true,
    });
    expect(session.appId).toBe("com.todo");
    expect(mocks.exec).toHaveBeenCalledWith("xcrun", [
      "simctl",
      "uninstall",
      "device-id",
      "com.todo",
    ]);
  });

  it("does not allow resetting SpringBoard even with an explicit bundle id", async () => {
    await expect(
      XcodeSession.start({ appId: "com.apple.springboard", appReset: true }),
    ).rejects.toThrow("cannot reset SpringBoard");
    expect(mocks.exec).not.toHaveBeenCalled();
    expect(mocks.cp).not.toHaveBeenCalled();
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it.each(["install", "launch"])(
    "cleans up after simctl %s fails",
    async (operation) => {
      mocks.exec.mockImplementation(async (_command, args) => {
        if (args[1] === operation) throw new Error(`${operation} failed`);
        return { stdout: "com.todo\n", stderr: "" };
      });
      await expect(
        XcodeSession.start({ appPath: "/tmp/Todo.app" }),
      ).rejects.toThrow(`${operation} failed`);
      expect(mocks.callTool.mock.calls.at(-1)?.[0]).toEqual({
        name: "DeviceInteractionEndSession",
        arguments: { interactionSessionKey: "session-key" },
      });
      expect(mocks.close).toHaveBeenCalledOnce();
    },
  );

  it("requires an app when launch options are supplied without a workspace", async () => {
    await expect(
      XcodeSession.start({ launchArgs: ["-UITesting"] }),
    ).rejects.toThrow("An app is required");
    expect(mocks.connect).not.toHaveBeenCalled();
  });

  it.each(["/tmp/Todo.xcodeproj", "/tmp/Todo.xcworkspace"])(
    "opens, builds, installs, and runs %s passed as appPath",
    async (appPath) => {
      const session = await XcodeSession.start({
        appPath,
        launchArgs: ["-UITesting"],
        launchEnv: { API_URL: "staging" },
      });
      expect(
        mocks.callTool.mock.calls
          .slice(0, 3)
          .map(([request]) => (request as { name: string }).name),
      ).toEqual([
        "XcodeOpenWorkspace",
        "DeviceInteractionStartWorkspaceSession",
        "DeviceInteractionInstallAndRun",
      ]);
      expect(mocks.callTool.mock.calls[2]?.[0]).toEqual({
        name: "DeviceInteractionInstallAndRun",
        arguments: {
          workspaceIdentifier: "workspace1",
          interactionSessionKey: "session-key",
          commandLineArguments: ["-UITesting"],
          environmentVariables: { API_URL: "staging" },
        },
      });
      expect(session.appId).toBe("com.todo");
      expect(mocks.exec).toHaveBeenCalledOnce();
      expect(mocks.exec).toHaveBeenCalledWith(
        "xcrun",
        [
          "xcodebuild",
          appPath.endsWith(".xcodeproj") ? "-project" : "-workspace",
          appPath,
          "-scheme",
          "Todo",
          "-destination",
          "id=device-id",
          "-showBuildSettings",
          "-json",
        ],
        { timeout: XcodeSession.TOOL_TIMEOUT_MS },
      );
    },
  );

  it("accepts JSON text when structured content is absent", async () => {
    const session = await XcodeSession.start({ appId: "com.todo" });
    mocks.callTool.mockResolvedValueOnce({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            hierarchyPath: "/tmp/hierarchy.txt",
            screenshotPath: "/tmp/screen.png",
          }),
        },
      ],
    });
    expect((await session.capture()).tree.elementById(2).label).toBe("Add");
  });

  it("recaptures a missing hierarchy without replaying the action", async () => {
    const session = await XcodeSession.start({ appId: "com.todo" });
    mocks.callTool.mockResolvedValueOnce(
      result({ screenshotPath: "/tmp/screen.png" }),
    );
    await session.capture("t 30 40");
    expect(mocks.callTool.mock.calls.at(-2)?.[0]).toEqual({
      name: "DeviceInteractionSynthesize",
      arguments: {
        interactSessionKey: "session-key",
        interactionCommand: "t 30 40",
      },
    });
    expect(mocks.callTool.mock.calls.at(-1)?.[0]).toEqual({
      name: "DeviceInteractionSynthesize",
      arguments: { interactSessionKey: "session-key" },
    });
  });

  it("ends a device session if installation fails and preserves the error", async () => {
    mocks.callTool
      .mockResolvedValueOnce(
        result({ workspaceIdentifier: "workspace1", activeScheme: "Todo" }),
      )
      .mockResolvedValueOnce(
        result({
          interactionSessionKey: "session-key",
          deviceUUID: "device-id",
          deviceIsSimulator: true,
        }),
      )
      .mockResolvedValueOnce({
        isError: true,
        content: [{ type: "text", text: "Build failed" }],
      });
    await expect(
      XcodeSession.start({ appPath: "/tmp/Todo.xcodeproj" }),
    ).rejects.toThrow("Build failed");
    expect(mocks.callTool.mock.calls.at(-1)?.[0]).toEqual({
      name: "DeviceInteractionEndSession",
      arguments: { interactionSessionKey: "session-key" },
    });
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("rejects physical devices and cleans up the session", async () => {
    mocks.callTool.mockResolvedValueOnce(
      result({
        interactionSessionKey: "session-key",
        deviceUUID: "device-id",
        deviceIsSimulator: false,
      }),
    );
    await expect(XcodeSession.start({ appId: "com.todo" })).rejects.toThrow(
      "simulators only",
    );
    expect(mocks.close).toHaveBeenCalledOnce();
  });

  it("disconnects even if ending a session fails", async () => {
    const session = await XcodeSession.start({ appId: "com.todo" });
    mocks.callTool.mockRejectedValueOnce(new Error("End failed"));
    await expect(session.close()).rejects.toThrow("End failed");
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.closeSimulator).toHaveBeenCalledOnce();
  });

  it.each([undefined, false, true])(
    "passes headless=%s to its simulator window and closes it on stop",
    async (headless) => {
      const session = await XcodeSession.start({ appId: "com.todo", headless });
      expect(mocks.openSimulator).toHaveBeenCalledWith("device-id", headless);
      await session.close();
      expect(mocks.closeSimulator).toHaveBeenCalledOnce();
    },
  );

  it("closes Simulator after a launch failure", async () => {
    mocks.exec.mockRejectedValueOnce(new Error("Launch failed"));
    await expect(
      XcodeSession.start({ appId: "com.todo", headless: false }),
    ).rejects.toThrow("Launch failed");
    expect(mocks.openSimulator).toHaveBeenCalledOnce();
    expect(mocks.closeSimulator).toHaveBeenCalledOnce();
  });

  it("closes Simulator even when disconnecting fails", async () => {
    const session = await XcodeSession.start({ appId: "com.todo" });
    mocks.close.mockRejectedValueOnce(new Error("Disconnect failed"));
    await expect(session.close()).rejects.toThrow("Disconnect failed");
    expect(mocks.closeSimulator).toHaveBeenCalledOnce();
  });

  it("reads full-size screenshots as base64", async () => {
    const session = await XcodeSession.start({ appId: "com.todo" });
    const screenshot = await session.screenshot();
    expect(screenshot).toBe(
      Buffer.from(await mocks.readFile()).toString("base64"),
    );
    expect(mocks.readFile).toHaveBeenCalledWith("/tmp/screen.png");
  });
});

function result(structuredContent: Record<string, unknown>) {
  return { content: [], structuredContent };
}
