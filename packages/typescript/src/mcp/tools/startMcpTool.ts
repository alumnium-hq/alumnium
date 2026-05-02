import fs from "node:fs";
import path from "node:path";
import z from "zod";
import { Alumni } from "../../client/Alumni.ts";
import { NativeClient } from "../../clients/NativeClient.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import { DragSliderTool } from "../../tools/DragSliderTool.ts";
import { ExecuteJavascriptTool } from "../../tools/ExecuteJavascriptTool.ts";
import { NavigateBackTool } from "../../tools/NavigateBackTool.ts";
import { NavigateToUrlTool } from "../../tools/NavigateToUrlTool.ts";
import { PrintToPdfTool } from "../../tools/PrintToPdfTool.ts";
import { ScrollTool } from "../../tools/ScrollTool.ts";
import { SwitchToNextTabTool } from "../../tools/SwitchToNextTabTool.ts";
import { SwitchToPreviousTabTool } from "../../tools/SwitchToPreviousTabTool.ts";
import { McpArtifactsStore } from "../McpArtifactsStore.ts";
import { McpProfilesStore } from "../McpProfilesStore.ts";
import {
  createAndroidDriver,
  createChromeDriver,
  createIosDriver,
  type McpDriver,
} from "../mcpDrivers.ts";
import { McpState } from "../McpState.ts";
import { McpTool } from "./McpTool.ts";

const { tracer } = Telemetry.get(import.meta.url);

/**
 * Start a new driver instance.
 */
export const startMcpTool = McpTool.define("start", {
  description:
    "Initialize a browser driver for automated testing. Returns an id for use in other calls.",

  inputSchema: z.object({
    capabilities: z.string().describe(
      `
          JSON string or path to a JSON file with Selenium/Appium/Playwright capabilities and Alumnium-specific options.

          Must include "platformName" (e.g., "chrome", "ios", "android").

          Example JSON string: '{"platformName": "ios", "appium:deviceName": "iPhone 16", "appium:platformVersion": "18.0"}'.

          Example file path: "/path/to/capabilities.json".

          Top-level options:

          Alumnium-specific options go in "alumnium:options":
            - "autoswitchToNewTab" (boolean, default true) — auto-switch to newly opened tabs;
            - "baseUrl" (string) — URL to navigate to automatically after driver start, e.g. "https://example.com";
            - "changeAnalysis" (boolean, default true) — enable UI changes analysis agent;
            - "cookies" (array) — cookies to set, supported for Selenium and Playwright, e.g. [{"name": "session", "value": "abc123", "domain": ".example.com"}];
            - "excludeAttributes" (string[]) — accessibility attributes to exclude from the tree (e.g., ["src"]);
            - "executablePath" (string) — path to a custom Chrome executable;
            - "fullPageScreenshot" (boolean, default false) — capture full-page screenshots.
            - "headers" (object) — extra HTTP headers for every request, supported for Selenium and Playwright, e.g. {"Authorization": "Bearer token"};
            - "headless" (boolean, default false) — run browser headless, supported for Selenium and Playwright;
            - "newTabTimeout" (number, default 200) — ms to wait for new tab detection, Playwright only;
            - "permissions" (string[]) — browser permissions to grant, Playwright only, e.g. ["camera"];
            - "planner" (boolean) — enable/disable planner agent;
            - "profile" (string) — name of a persistent browser profile; cookies, sessions, and storage are preserved across restarts in ~/.alumnium/profiles/{name}, e.g. "personal".

          Example: '{"platformName": "chrome", "alumnium:options": {"headless": true, "executablePath": "/Applications/Arc.app/Contents/MacOS/Arc", "profile": "work"}}'.
        `
        .replace(/\n\s*/g, " ")
        .trim(),
    ),

    server_url: z
      .string()
      .describe(
        "Optional remote Selenium/Appium server URL. Examples: 'http://localhost:4723', 'https://mobile-hub.lambdatest.com/wd/hub'. Defaults to local driver (Chrome) or localhost:4723 (Appium)",
      )
      .optional(),
  }),

  async execute(input, { logger }) {
    // Resolve capabilities: file path or inline JSON string
    let rawCapabilities: string;
    const filePath = path.resolve(input.capabilities);
    if (fs.existsSync(filePath)) {
      try {
        rawCapabilities = fs.readFileSync(filePath, "utf-8");
      } catch (error) {
        const message = `Failed to read capabilities file '${filePath}': ${error}`;
        logger.error(message);
        throw new Error(message);
      }
    } else {
      rawCapabilities = input.capabilities;
    }

    // Parse capabilities JSON
    let capabilities: Record<string, unknown>;
    try {
      capabilities = JSON.parse(rawCapabilities);
    } catch (error) {
      const message = `Invalid JSON in capabilities parameter: ${error}`;
      logger.error(message);
      throw new Error(message);
    }

    // Extract and validate platformName
    if (
      typeof capabilities.platformName !== "string" ||
      !capabilities.platformName
    ) {
      const message = "Capabilities must include 'platformName' field";
      logger.error(message);
      throw new Error(message);
    }
    const platformName = capabilities.platformName.toLowerCase();
    capabilities.platformName = platformName;

    const serverUrl =
      typeof input["server_url"] === "string" ? input["server_url"] : null;

    // Extract alumnium:options for Alumnium driver configuration
    const alumniumOptions =
      (capabilities["alumnium:options"] as
        | Record<string, unknown>
        | undefined) || {};
    delete capabilities["alumnium:options"];

    const baseUrl =
      typeof alumniumOptions["baseUrl"] === "string"
        ? alumniumOptions["baseUrl"]
        : undefined;
    const planner =
      typeof alumniumOptions["planner"] === "boolean"
        ? alumniumOptions["planner"]
        : undefined;
    const changeAnalysis =
      typeof alumniumOptions["changeAnalysis"] === "boolean"
        ? alumniumOptions["changeAnalysis"]
        : true;
    const excludeAttributes = Array.isArray(
      alumniumOptions["excludeAttributes"],
    )
      ? alumniumOptions["excludeAttributes"].filter(
          (value): value is string => typeof value === "string",
        )
      : undefined;

    // Generate driver ID from current directory and timestamp
    const cwdName = path.basename(process.cwd());
    const timestamp = Math.floor(Date.now() / 1000);
    const id = `${cwdName}-${timestamp}`;

    // Create directories
    const artifactsStore = new McpArtifactsStore(id);
    const profilesStore = new McpProfilesStore();

    const driverOptions: McpDriver.DriverOptions = {
      ...(alumniumOptions["headers"] !== undefined && {
        headers: alumniumOptions["headers"] as McpDriver.Headers,
      }),
      ...(alumniumOptions["cookies"] !== undefined && {
        cookies: alumniumOptions["cookies"] as McpDriver.Cookies,
      }),
      ...(Array.isArray(alumniumOptions["permissions"]) && {
        permissions: alumniumOptions["permissions"] as string[],
      }),
      ...(typeof alumniumOptions["headless"] === "boolean" && {
        headless: alumniumOptions["headless"],
      }),
      ...(typeof alumniumOptions["profile"] === "string" && {
        profileDir: await profilesStore.ensureDir(alumniumOptions["profile"]),
      }),
      ...(typeof alumniumOptions["executablePath"] === "string" && {
        executablePath: alumniumOptions["executablePath"],
      }),
    };

    const alumniumOptionsNonDriverKeys = new Set([
      "baseUrl",
      "changeAnalysis",
      "cookies",
      "excludeAttributes",
      "executablePath",
      "headers",
      "headless",
      "permissions",
      "planner",
    ]);
    const driverSettings: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(alumniumOptions)) {
      if (!alumniumOptionsNonDriverKeys.has(key)) {
        driverSettings[key] = value;
      }
    }

    logger.info(`Starting driver ${id} for platform: ${platformName}`);

    // Detect platform and create appropriate driver
    let driver: McpDriver;
    if (["chrome", "chromium"].includes(platformName)) {
      driver = await tracer.span(
        "mcp.driver.start",
        {
          "mcp.driver.id": id,
          "mcp.driver.kind": "playwright",
          "mcp.driver.platform": platformName,
        },
        () =>
          createChromeDriver(
            capabilities,
            serverUrl,
            artifactsStore,
            driverOptions,
          ),
      );
    } else if (platformName === "ios") {
      driver = await tracer.span(
        "mcp.driver.start",
        {
          "mcp.driver.id": id,
          "mcp.driver.kind": "appium",
          "mcp.driver.platform": platformName,
        },
        () => createIosDriver(capabilities, serverUrl),
      );
    } else if (platformName === "android") {
      driver = await tracer.span(
        "mcp.driver.start",
        {
          "mcp.driver.id": id,
          "mcp.driver.kind": "appium",
          "mcp.driver.platform": platformName,
        },
        async () => createAndroidDriver(capabilities, serverUrl),
      );
    } else {
      logger.error(`Unsupported platformName: ${platformName}`);
      throw new Error(
        `Unsupported platformName: ${platformName}. Supported values: chrome, chromium, ios, android`,
      );
    }

    tracer.span("mcp.driver.active", { "mcp.driver.id": id }, id);

    const al = new Alumni(driver, {
      extraTools: [
        DragSliderTool,
        ExecuteJavascriptTool,
        NavigateBackTool,
        NavigateToUrlTool,
        PrintToPdfTool,
        ScrollTool,
        SwitchToNextTabTool,
        SwitchToPreviousTabTool,
      ],
      planner,
      changeAnalysis,
      excludeAttributes,
    });

    const client = al.client;
    if (!(client instanceof NativeClient)) {
      const message = "Expected client to be an instance of NativeClient";
      logger.error(message);
      throw new Error(message);
    }

    // Apply driver options to Alumnium driver
    if (Object.keys(driverSettings).length) {
      logger.debug(`Applying driver options: {driverSettings}`, {
        driverSettings,
      });
      for (const [key, value] of Object.entries(driverSettings)) {
        if (key in al.driver) {
          try {
            // @ts-expect-error
            al.driver[key] = value;
            logger.debug(`Set driver option ${key}={value}`, { value });
          } catch (error) {
            logger.warn(`Failed to set driver option ${key}: ${error}`);
          }
        } else {
          logger.warn(`Unknown driver option: ${key}`);
        }
      }
    }

    if (baseUrl) {
      logger.info(`Navigating to baseUrl: ${baseUrl}`);
      await al.driver.visit(baseUrl);
    }

    // Register driver in global state
    McpState.registerDriver(id, al, driver, artifactsStore);

    const model = await al.model();

    return [
      {
        type: "text",
        text: JSON.stringify({
          id: id,
          driver: al.driver.constructor.name
            .replace(/Driver$/, "")
            .toLowerCase(),
          model: `${model.provider}/${model.name}`,
          platform_name: platformName,
        }),
      },
    ];
  },
});
