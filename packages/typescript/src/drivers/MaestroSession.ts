import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import {
  getDefaultEnvironment,
  StdioClientTransport,
} from "@modelcontextprotocol/sdk/client/stdio.js";
import { spawn } from "node:child_process";
import os from "node:os";
import path from "node:path";
import z from "zod";
import { ALUMNIUM_VERSION } from "../package.ts";
import { Logger } from "../telemetry/Logger.ts";
import { sleep } from "../utils/timers.ts";
import { lit } from "smollit";

const logger = Logger.get(import.meta.url);

export namespace MaestroSession {
  export type Os = z.infer<typeof MaestroSession.Os>;

  /**
   * A node of Maestro's compacted view hierarchy. Keys are abbreviated (`b` for bounds, `c` for
   * children, and so on) and every attribute is optional — absent ones take the value from
   * `ui_schema.defaults`.
   */
  export interface Node {
    [key: string]: unknown;
  }

  /** What `inspect_screen` returns: an abbreviation legend plus a list of root nodes. */
  export interface Hierarchy {
    ui_schema: {
      platform?: string;
      abbreviations: Record<string, string>;
      defaults: Record<string, unknown>;
    };
    elements: Node[];
  }

  export interface Device {
    device_id: string;
    name: string;
    platform: string;
    type: string;
    connected: boolean;
  }

  export interface Props {
    /** Application identifier, e.g. an iOS bundle id: `com.ayodeji.TodoList`. */
    appId: string;
    /** Maestro device id, i.e. a simulator UDID. Defaults to the first connected device. */
    deviceId?: string | undefined;
    /** Path to the `maestro` executable. Defaults to `~/.maestro/bin/maestro`. */
    executablePath?: string | undefined;
    /** Arguments the app is launched with. */
    launchArgs?: string[] | undefined;
    /**
     * Environment the app is launched with. Maestro's own `launchApp` cannot set one, so a session
     * that needs it is launched through `simctl` instead — see `launchApp`. iOS simulators only.
     */
    launchEnv?: Record<string, string> | undefined;
  }

  export interface LaunchAppOptions {
    clearState?: boolean;
  }

  /** A single content item of an MCP tool result. */
  export interface Content {
    type: string;
    text?: string;
    data?: string;
    mimeType?: string;
  }
}

/**
 * A live Maestro session, driven through Maestro's own MCP server (`maestro mcp`) over stdio.
 */
export class MaestroSession {
  static Os = z.enum(["ios", "android"]);

  /** Marks the object for `Alumni`'s duck-typed driver detection. */
  readonly isMaestroSession = true as const;

  readonly appId: string;

  #client: Client | undefined;
  #deviceId: string | undefined;
  #os: MaestroSession.Os = "ios";
  readonly #requestedDeviceId: string | undefined;
  readonly #executablePath: string;
  readonly #launchEnv: Record<string, string>;
  readonly #launchArgs: string[];

  constructor(props: MaestroSession.Props) {
    this.appId = props.appId;
    this.#requestedDeviceId = props.deviceId;
    this.#executablePath =
      props.executablePath ??
      path.join(os.homedir(), ".maestro", "bin", "maestro");
    this.#launchEnv = props.launchEnv ?? {};
    this.#launchArgs = props.launchArgs ?? [];
  }

  get deviceId(): string {
    if (!this.#deviceId) throw new Error("Maestro session is not started");
    return this.#deviceId;
  }

  get os(): MaestroSession.Os {
    return this.#os;
  }

  static async start(props: MaestroSession.Props): Promise<MaestroSession> {
    const session = new MaestroSession(props);
    await session.#connect();
    return session;
  }

  async #connect(): Promise<void> {
    logger.info(`Starting Maestro MCP server: ${this.#executablePath} mcp`);

    const env = {
      ...getDefaultEnvironment(),
      // The SDK's default environment forwards only HOME/PATH/SHELL/TERM/USER.
      ...toolchainEnvironment(),
      MAESTRO_CLI_ANALYSIS_NOTIFICATION_DISABLED: "true",
    };
    const transport = new StdioClientTransport({
      command: this.#executablePath,
      args: ["mcp"],
      env,
      stderr: "pipe",
    });

    const client = new Client({
      name: "alumnium",
      version: ALUMNIUM_VERSION,
    });

    // Keep the tail of what Maestro printed, so an early exit can say why instead of the SDK's
    // bare "Connection closed".
    const stderrTail: string[] = [];
    transport.onclose = () => {
      const output = stderrTail.join("").trim();
      if (output) logger.warn(`Maestro MCP server exited:\n${output}`);
    };

    try {
      await client.connect(transport);
    } catch (error) {
      throw new Error(
        `Maestro MCP server failed to start: ${error}\n${await this.#describeLauncherFailure(env)}`,
      );
    }
    this.#client = client;

    transport.stderr?.on("data", (chunk: unknown) => {
      const text = String(chunk);
      stderrTail.push(text);
      while (stderrTail.length > 50) stderrTail.shift();
      logger.debug(`Maestro: ${text.trim()}`);
    });

    const device = await this.#resolveDevice();
    this.#deviceId = device.device_id;
    this.#os = MaestroSession.Os.safeParse(device.platform).data ?? "ios";
    logger.info(`Using Maestro device ${device.name} (${this.#os})`);
  }

  async #resolveDevice(): Promise<MaestroSession.Device> {
    const { devices } = await this.#callJsonTool<{
      devices: MaestroSession.Device[];
    }>("list_devices", {});

    if (this.#requestedDeviceId) {
      const device = devices.find(
        (candidate) => candidate.device_id === this.#requestedDeviceId,
      );
      if (!device) {
        throw new Error(
          `Maestro device ${this.#requestedDeviceId} not found. Available: ${devices
            .map((candidate) => candidate.device_id)
            .join(", ")}`,
        );
      }
      return device;
    }

    const connected = devices.find((candidate) => candidate.connected);
    if (!connected) {
      throw new Error(
        "No connected Maestro device found. Boot a simulator or emulator first.",
      );
    }
    return connected;
  }

  inspectScreen(): Promise<MaestroSession.Hierarchy> {
    return this.#callJsonTool<MaestroSession.Hierarchy>("inspect_screen", {});
  }

  /**
   * Runs Maestro flow commands against the running app.
   *
   * The commands are wrapped in a flow with an `appId` header. Maestro does not relaunch or reset
   * the app for a flow that has no explicit `launchApp`, so consecutive calls act on the state the
   * previous one left behind.
   *
   * @param commands Flow body in Maestro YAML, e.g. `- tapOn:\n    point: "10,20"`.
   */
  async run(commands: string): Promise<void> {
    const yaml = `appId: ${this.appId}\n---\n${commands}\n`;
    logger.debug("Running Maestro flow: {yaml}", { yaml });
    await this.#callJsonTool<{ success: boolean; message?: string }>("run", {
      yaml,
    });
  }

  /**
   * Launches the app, optionally wiping its state first.
   *
   * With a launch environment or arguments, the launch goes through `simctl` rather than Maestro:
   * Maestro's `launchApp` can pass neither, and an app that reads its configuration from the
   * environment only sees it on a launch that actually sets one. Maestro then drives whatever is on
   * screen, which is the app this just started — its flows never relaunch on their own.
   */
  async launchApp(
    options: MaestroSession.LaunchAppOptions = {},
  ): Promise<void> {
    const clearState = options.clearState ?? false;
    const configured =
      Object.keys(this.#launchEnv).length > 0 || this.#launchArgs.length > 0;

    if (!configured) {
      await this.run(lit`
        - launchApp:
            clearState: ${clearState}
      `);
      // iOS blocks until the app is up. On Android, Maestro returns once the launch intent is
      // dispatched, before the activity owns the screen — a tree read at that moment sees only the
      // system bars — so wait for the app window to appear before handing control back.
      if (this.#os === "android") await this.#waitForAndroidWindow();
      return;
    }

    if (this.#os !== "ios") {
      throw new Error(
        "A launch environment is only supported on iOS simulators; on Android, pass the values as intent extras instead.",
      );
    }

    // Maestro owns app state, so let it do the wiping and keep simctl to the launch itself.
    if (clearState) await this.run("- clearState");
    await this.#launchWithSimctl();
  }

  async #launchWithSimctl(): Promise<void> {
    const before = await this.#screenFingerprint();
    const args = [
      "simctl",
      "launch",
      "--terminate-running-process",
      this.deviceId,
      this.appId,
      ...this.#launchArgs,
    ];
    logger.info(
      `Launching ${this.appId} via simctl with ${Object.keys(this.#launchEnv).length} env var(s)`,
    );

    const child = await this.#spawn("xcrun", args, {
      // oxlint-disable-next-line node/no-process-env
      ...process.env,
      // simctl forwards SIMCTL_CHILD_-prefixed variables to the app it launches.
      ...Object.fromEntries(
        Object.entries(this.#launchEnv).map(([key, value]) => [
          `SIMCTL_CHILD_${key}`,
          value,
        ]),
      ),
    });

    if (child.status !== 0) {
      throw new Error(
        `simctl launch failed for ${this.appId}: ${(child.stderr || child.stdout || "").trim()}`,
      );
    }
    await this.#waitForLaunch(before);
  }

  /**
   * Runs a command to completion without blocking the event loop. `spawnSync` would stall the MCP
   * transport this session lives on for the whole run.
   */
  /**
   * The MCP transport swallows what a child printed before dying, so re-run the launcher alone
   * and hand back its output. A missing JDK or a broken install shows up here verbatim.
   */
  async #describeLauncherFailure(env: NodeJS.ProcessEnv): Promise<string> {
    try {
      const probe = await this.#spawn(this.#executablePath, ["--version"], env);
      return `\`${this.#executablePath} --version\` exited with ${probe.status}: ${(probe.stderr || probe.stdout).trim()}`;
    } catch (error) {
      return `\`${this.#executablePath}\` could not be run: ${error}`;
    }
  }

  #spawn(
    command: string,
    args: string[],
    env: NodeJS.ProcessEnv,
  ): Promise<{ status: number | null; stdout: string; stderr: string }> {
    return new Promise((resolve, reject) => {
      const child = spawn(command, args, {
        env,
        stdio: ["ignore", "pipe", "pipe"],
      });
      let stdout = "";
      let stderr = "";
      child.stdout.setEncoding("utf-8");
      child.stderr.setEncoding("utf-8");
      child.stdout.on("data", (chunk: string) => (stdout += chunk));
      child.stderr.on("data", (chunk: string) => (stderr += chunk));
      child.on("error", reject);
      child.on("close", (status) => resolve({ status, stdout, stderr }));
    });
  }

  async #waitForAndroidWindow(timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (await this.#androidWindowPresent()) {
        // Settles the launch animation, so the first tree read is of a finished screen.
        await this.run("- waitForAnimationToEnd");
        return;
      }
      await sleep(1000);
    }
    logger.info(
      `${this.appId} did not put its window on screen within ${timeoutMs}ms of launching`,
    );
  }

  async #androidWindowPresent(): Promise<boolean> {
    try {
      const hierarchy = await this.inspectScreen();
      const keyFor = (name: string) =>
        Object.entries(hierarchy.ui_schema.abbreviations).find(
          ([, full]) => full === name,
        )?.[0] ?? name;
      const ridKey = keyFor("resource-id");
      const childrenKey = keyFor("children");
      const has = (node: MaestroSession.Node): boolean =>
        node[ridKey] === "android:id/content" ||
        (Array.isArray(node[childrenKey]) &&
          (node[childrenKey] as MaestroSession.Node[]).some(has));
      return hierarchy.elements.some(has);
    } catch {
      return false;
    }
  }

  async #screenFingerprint(): Promise<string> {
    try {
      const hierarchy = await this.inspectScreen();
      return JSON.stringify(hierarchy.elements).slice(0, 2_000);
    } catch {
      return "";
    }
  }

  /**
   * Waits for the launched app to own the screen.
   *
   * `simctl launch` returns as soon as the process forks, so without this the next tree read lands
   * on the launcher and every assertion fails against the wrong screen. Maestro's own `launchApp`
   * blocks until the app is up; this restores that guarantee for the simctl path.
   */
  async #waitForLaunch(before: string, timeoutMs = 30_000): Promise<void> {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 500));
      if ((await this.#screenFingerprint()) !== before) {
        // Settles the launch animation, so the first tree read is of a finished screen.
        await this.run("- waitForAnimationToEnd");
        return;
      }
    }
    logger.info(
      `${this.appId} did not take over the screen within ${timeoutMs}ms of launching`,
    );
  }

  /** Takes a screenshot and returns it base64-encoded. */
  async screenshot(): Promise<string> {
    const content = await this.#callTool("take_screenshot", {});
    for (const item of content) {
      if (item.type === "image" && typeof item.data === "string") {
        return item.data;
      }
    }
    throw new Error("Maestro returned no screenshot image");
  }

  async close(): Promise<void> {
    const client = this.#client;
    this.#client = undefined;
    if (!client) return;
    logger.debug("Closing Maestro MCP session");
    await client.close();
  }

  //#region MCP plumbing

  async #callJsonTool<Result>(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<Result> {
    const content = await this.#callTool(tool, args);
    const texts = content
      .filter((item) => item.type === "text")
      .map((item) => item.text ?? "");

    const json = texts
      .map((text) => {
        const start = text.indexOf("{");
        return start === -1 ? null : text.slice(start);
      })
      .findLast((candidate) => candidate !== null);

    if (json === undefined) {
      throw new Error(
        `Maestro ${tool} returned no JSON payload: ${texts.join("\n")}`,
      );
    }

    let parsed: Result & { success?: boolean; message?: string };
    try {
      parsed = JSON.parse(json);
    } catch (error) {
      throw new Error(`Maestro ${tool} returned malformed JSON: ${error}`);
    }

    // `run` reports command failures in the payload as well as via `isError`.
    if (parsed.success === false) {
      throw new Error(
        `Maestro ${tool} failed: ${parsed.message ?? "unknown error"}`,
      );
    }
    return parsed;
  }

  async #callTool(
    tool: string,
    args: Record<string, unknown>,
  ): Promise<MaestroSession.Content[]> {
    const client = this.#client;
    if (!client) throw new Error("Maestro session is not started");

    // Every tool but `list_devices` targets a device, and `list_devices` is what resolves it.
    const deviceArgs =
      tool === "list_devices" ? {} : { device_id: this.deviceId };
    const result = await client.callTool({
      name: tool,
      arguments: { ...deviceArgs, ...args },
    });

    const content = (result.content ?? []) as MaestroSession.Content[];
    if (result.isError) {
      const message = content
        .filter((item) => item.type === "text")
        .map((item) => item.text ?? "")
        .join("\n");
      throw new Error(`Maestro ${tool} failed: ${message}`);
    }
    return content;
  }

  //#endregion
}

/**
 * Toolchain location variables, whichever of them are set. Maestro is a Java program launched
 * through a shell script: on macOS the `java` on PATH is Apple's stub, which needs `JAVA_HOME`
 * to find a JDK, and its Android side finds `adb` through the SDK variables.
 */
function toolchainEnvironment(): Record<string, string> {
  const forwarded: Record<string, string> = {};
  for (const name of ["JAVA_HOME", "ANDROID_HOME", "ANDROID_SDK_ROOT"]) {
    // oxlint-disable-next-line node/no-process-env -- forwarded verbatim to the child process
    const value = process.env[name];
    if (value) forwarded[name] = value;
  }
  return forwarded;
}
