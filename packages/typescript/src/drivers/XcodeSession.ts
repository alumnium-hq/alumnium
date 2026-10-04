import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { randomUUID } from "node:crypto";
import { cp, mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { XcodeAccessibilityTree } from "../accessibility/XcodeAccessibilityTree.ts";
import { ALUMNIUM_VERSION } from "../package.ts";
import { exec } from "../utils/process.ts";
import { SimulatorWindow } from "./SimulatorWindow.ts";

export namespace XcodeSession {
  export interface Props {
    appId?: string | undefined;
    /** Local simulator app bundle, Xcode project, or Xcode workspace. */
    appPath?: string | undefined;
    /** Reinstall the app to clear its data before launch. Defaults to false. */
    appReset?: boolean | undefined;
    device?: string | undefined;
    /** Hide the macOS Simulator window. Defaults to false. */
    headless?: boolean | undefined;
    launchArgs?: string[] | undefined;
    launchEnv?: Record<string, string> | undefined;
  }

  export interface Capture {
    tree: XcodeAccessibilityTree;
    screenshotPath: string;
  }
}

const OpenWorkspace = z.object({
  workspaceIdentifier: z.string(),
  activeScheme: z.string().nullable().optional(),
});

const Schemes = z.object({
  activeSchemeName: z.string().nullable().optional(),
});

const BuildSettings = z.array(
  z.object({
    buildSettings: z.object({
      PRODUCT_TYPE: z.string().optional(),
      PRODUCT_BUNDLE_IDENTIFIER: z.string().optional(),
    }),
  }),
);

const Session = z.object({
  interactionSessionKey: z.string(),
  deviceUUID: z.string(),
  deviceIsSimulator: z.boolean(),
});

const Capture = z.object({
  hierarchyPath: z.string().optional(),
  screenshotPath: z.string(),
});

/** A simulator interaction session served by Apple's `xcrun mcpbridge`. */
export class XcodeSession {
  static readonly TOOL_TIMEOUT_MS = 5 * 60_000;

  readonly #client = new Client({
    name: "alumnium",
    version: ALUMNIUM_VERSION,
  });
  readonly #props: XcodeSession.Props;
  #key: string | undefined;
  #appId: string;
  readonly #simulatorWindow = new SimulatorWindow();

  constructor(props: XcodeSession.Props) {
    this.#props = props;
    this.#appId = props.appId ?? "";
  }

  get appId(): string {
    return this.#appId;
  }

  static async start(props: XcodeSession.Props): Promise<XcodeSession> {
    const session = new XcodeSession(props);
    try {
      await session.#start();
      return session;
    } catch (error) {
      await session.close().catch(() => {});
      throw error;
    }
  }

  async #start(): Promise<void> {
    const { appPath, appReset, device, launchArgs, launchEnv } = this.#props;
    const workspace =
      appPath && /\.(xcodeproj|xcworkspace)[\\/]?$/i.test(appPath)
        ? appPath
        : undefined;
    if (
      !appPath &&
      !this.#appId &&
      (appReset || launchArgs?.length || Object.keys(launchEnv ?? {}).length)
    )
      throw new Error(
        "An app is required to reset or launch with arguments or environment variables",
      );
    await this.#client.connect(
      new StdioClientTransport({
        command: "xcrun",
        args: ["mcpbridge"],
        env: Object.fromEntries(
          // oxlint-disable-next-line node/no-process-env
          Object.entries(process.env).filter(
            (entry): entry is [string, string] => entry[1] !== undefined,
          ),
        ),
        stderr: "pipe",
      }),
    );
    const sessionIdentifier = `Alumnium ${randomUUID()}`;
    let workspaceIdentifier: string | undefined;
    let activeScheme: string | null | undefined;
    if (workspace) {
      const opened = OpenWorkspace.parse(
        await this.#call("XcodeOpenWorkspace", { path: workspace }),
      );
      workspaceIdentifier = opened.workspaceIdentifier;
      activeScheme = opened.activeScheme;
    }
    const result = Session.parse(
      await this.#call(
        workspace
          ? "DeviceInteractionStartWorkspaceSession"
          : "DeviceInteractionStartSession",
        {
          sessionIdentifier,
          ...(workspace ? { workspaceIdentifier } : {}),
          ...(workspace
            ? device && { deviceIdentifier: device }
            : { deviceIdentifier: device ?? "iPhone Simulator" }),
        },
      ),
    );
    this.#key = result.interactionSessionKey;
    if (!result.deviceIsSimulator)
      throw new Error(
        "XcodeDriver supports iOS simulators only; select a simulator using the device option",
      );
    await this.#simulatorWindow.open(result.deviceUUID, this.#props.headless);
    if (workspace) {
      await this.#call("DeviceInteractionInstallAndRun", {
        interactionSessionKey: this.#key,
        workspaceIdentifier,
        ...(launchArgs && { commandLineArguments: launchArgs }),
        ...(launchEnv && { environmentVariables: launchEnv }),
      });
      await this.#resolveWorkspaceApp(
        workspace,
        workspaceIdentifier!,
        result.deviceUUID,
        activeScheme,
      );
    } else {
      await this.#installApp(result.deviceUUID);
    }
    if (appReset) await this.#resetApp(result.deviceUUID);
    if (!workspace || appReset) await this.#launchApp(result.deviceUUID);
    await this.capture(undefined, this.#appId || undefined);
  }

  async #resolveWorkspaceApp(
    workspace: string,
    workspaceIdentifier: string,
    device: string,
    activeScheme: string | null | undefined,
  ): Promise<void> {
    const scheme =
      activeScheme ||
      Schemes.parse(
        await this.#call("XcodeListSchemes", { workspaceIdentifier }),
      ).activeSchemeName;
    if (!scheme) throw new Error("Xcode workspace has no active scheme");

    const { stdout } = await exec(
      "xcrun",
      [
        "xcodebuild",
        /\.xcodeproj[\\/]?$/i.test(workspace) ? "-project" : "-workspace",
        workspace,
        "-scheme",
        scheme,
        "-destination",
        `id=${device}`,
        "-showBuildSettings",
        "-json",
      ],
      { timeout: XcodeSession.TOOL_TIMEOUT_MS },
    );
    // Screen captures can belong to SpringBoard or a permission dialog, not the built app.
    const apps = BuildSettings.parse(JSON.parse(stdout)).filter(
      ({ buildSettings }) =>
        buildSettings.PRODUCT_TYPE === "com.apple.product-type.application" &&
        (!this.#appId ||
          buildSettings.PRODUCT_BUNDLE_IDENTIFIER === this.#appId),
    );
    if (apps.length !== 1)
      throw new Error(
        "Xcode could not uniquely identify the active scheme's app",
      );
    this.#appId = z
      .string()
      .trim()
      .min(1)
      .parse(apps[0]!.buildSettings.PRODUCT_BUNDLE_IDENTIFIER);
  }

  async #installApp(device: string): Promise<void> {
    const { appPath } = this.#props;
    if (appPath) {
      const { stdout } = await exec("/usr/libexec/PlistBuddy", [
        "-c",
        "Print :CFBundleIdentifier",
        path.join(appPath, "Info.plist"),
      ]);
      this.#appId = z.string().trim().min(1).parse(stdout);
      await exec("xcrun", ["simctl", "install", device, appPath], {
        timeout: XcodeSession.TOOL_TIMEOUT_MS,
      });
    }
  }

  async #resetApp(device: string): Promise<void> {
    if (!this.#appId)
      throw new Error(
        "Xcode could not determine the app bundle id for appReset",
      );
    if (this.#appId.toLowerCase() === "com.apple.springboard")
      throw new Error("Xcode cannot reset SpringBoard");

    const { stdout } = await exec("xcrun", [
      "simctl",
      "get_app_container",
      device,
      this.#appId,
      "app",
    ]);
    const appPath = z.string().trim().min(1).parse(stdout);
    const directory = await mkdtemp(
      path.join(os.tmpdir(), "alumnium-xcode-reset-"),
    );
    const savedApp = path.join(directory, path.basename(appPath));
    try {
      // Uninstall also removes the installed bundle, so preserve it for bundle-id sessions.
      await cp(appPath, savedApp, { recursive: true });
      await exec("xcrun", ["simctl", "uninstall", device, this.#appId]);
      await exec("xcrun", ["simctl", "install", device, savedApp], {
        timeout: XcodeSession.TOOL_TIMEOUT_MS,
      });
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  }

  async #launchApp(device: string): Promise<void> {
    const { launchArgs = [], launchEnv = {} } = this.#props;
    if (!this.#appId) return;

    await exec(
      "xcrun",
      [
        "simctl",
        "launch",
        "--terminate-running-process",
        device,
        this.#appId,
        ...launchArgs,
      ],
      {
        env: {
          // oxlint-disable-next-line node/no-process-env
          ...process.env,
          ...Object.fromEntries(
            Object.entries(launchEnv).map(([key, value]) => [
              `SIMCTL_CHILD_${key}`,
              value,
            ]),
          ),
        },
      },
    );
  }

  async capture(
    command?: string,
    activationBundleId?: string,
  ): Promise<XcodeSession.Capture> {
    if (!this.#key) throw new Error("Xcode session is not started");

    const result = Capture.parse(
      await this.#call("DeviceInteractionSynthesize", {
        interactSessionKey: this.#key,
        ...(command !== undefined && { interactionCommand: command }),
        ...(activationBundleId && { activationBundleId }),
      }),
    );

    // Missing hierarchies are transient. Retry the capture, never replay the interaction.
    if (!result.hierarchyPath) return this.#recapture();

    return this.#readCapture(result);
  }

  async #recapture(): Promise<XcodeSession.Capture> {
    const result = Capture.parse(
      await this.#call("DeviceInteractionSynthesize", {
        interactSessionKey: this.#key,
      }),
    );

    if (!result.hierarchyPath)
      throw new Error("Xcode could not capture the accessibility hierarchy");

    return this.#readCapture(result);
  }

  async #readCapture(
    result: z.infer<typeof Capture>,
  ): Promise<XcodeSession.Capture> {
    if (!result.hierarchyPath)
      throw new Error("Xcode could not capture the accessibility hierarchy");

    const source = await readFile(result.hierarchyPath, "utf-8");
    const tree = new XcodeAccessibilityTree(source);
    if (!this.#props.appId && !this.#props.appPath)
      this.#appId ||=
        tree.find((node) => node.type === "Application")?.activationBundleId ??
        "";

    return { tree, screenshotPath: result.screenshotPath };
  }

  async screenshot(): Promise<string> {
    const { screenshotPath } = await this.capture();
    return (await readFile(screenshotPath)).toString("base64");
  }

  async close(): Promise<void> {
    try {
      if (this.#key) {
        const key = this.#key;
        this.#key = undefined;
        await this.#call("DeviceInteractionEndSession", {
          interactionSessionKey: key,
        });
      }
    } finally {
      try {
        await this.#client.close();
      } finally {
        await this.#simulatorWindow.close();
      }
    }
  }

  async #call(name: string, args: Record<string, unknown>): Promise<unknown> {
    const result = await this.#client.callTool(
      { name, arguments: args },
      undefined,
      {
        timeout: XcodeSession.TOOL_TIMEOUT_MS,
      },
    );
    const content = z
      .array(z.object({ type: z.string(), text: z.string().optional() }))
      .parse(result.content);
    const text = content
      .filter((item) => item.type === "text")
      .map((item) => item.text ?? "")
      .join("\n");
    if (result.isError) throw new Error(`Xcode ${name} failed: ${text}`);
    return result.structuredContent ?? JSON.parse(text);
  }
}
