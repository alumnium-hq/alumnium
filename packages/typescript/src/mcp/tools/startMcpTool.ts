import fs from "node:fs";
import path from "node:path";

import { never } from "alwaysly";
import z from "zod";

import { Alumni } from "../../client/Alumni.ts";
import { Driver } from "../../drivers/Driver.ts";
import { Env } from "../../Env.ts";
import { NavigationPolicy } from "../../NavigationPolicy.ts";
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
import { McpState } from "../McpState.ts";
import {
  createChromeDriver,
  createMobileDriver,
  type McpDriver,
} from "../mcpDrivers.ts";
import { McpTool } from "./McpTool.ts";

const { tracer } = Telemetry.get(import.meta.url);

/**
 * Parses `alumnium:options.device` into either a device name/identifier (string) or a Playwright
 * device-descriptor object (e.g. pasted directly from Playwright's own device list). A string is
 * a Playwright catalog name for browsers and a device name, UDID or serial for mobile drivers.
 * Field-level validation of the object form happens downstream in `resolveDeviceOptions`.
 */
function parseDeviceOption(
  value: unknown,
): string | McpDriver.DeviceDescriptor | undefined {
  if (typeof value === "string") {
    return value;
  }
  if (typeof value !== "object" || value === null) {
    return undefined;
  }
  return value as McpDriver.DeviceDescriptor;
}

/**
 * Parses `alumnium:options.navigationPolicy` into `NavigationPolicy.Options`, keeping only the
 * domain fields without `allowedFilePaths`.
 */
function parseNavigationPolicyOption(value: unknown): NavigationPolicy.Options {
  if (typeof value !== "object" || value === null) {
    return {};
  }
  const record = value as Record<string, unknown>;
  const stringArray = (entry: unknown): string[] | undefined =>
    Array.isArray(entry)
      ? entry.filter((item): item is string => typeof item === "string")
      : undefined;

  return {
    allowedDomains: stringArray(record["allowedDomains"]),
    deniedDomains: stringArray(record["deniedDomains"]),
  };
}

/**
 * Start a new driver instance.
 */
export const startMcpTool = McpTool.define("start", {
  description:
    "Initialize a session (browser, simulator, etc.) for automated testing. Returns an id for use in other calls.",

  inputSchema: z.object({
    capabilities: z.string().describe(
      `
          JSON string or path to a JSON file with Selenium/Appium/Playwright capabilities and Alumnium-specific options.

          Must include "platformName" (e.g., "chrome", "ios", "android").

          Example JSON string: '{"platformName": "ios", "appium:platformVersion": "18.0", "alumnium:options": {"app": "com.example.app", "device": "iPhone 16"}}'.

          Example file path: "/path/to/capabilities.json".

          Alumnium-specific options go in "alumnium:options":
            - "app" (string) — the mobile app to run (iOS bundle id, Android package name, or path/URL to install);
            - "appArguments" (string[]) — command-line arguments to launch the mobile app with, e.g. ["-UITesting"];
            - "appEnvironment" (object) — environment variables to launch the mobile app with, e.g. {"API_URL": "https://staging.example.com"};
            - "appReset" (boolean, default false) — wipe the app's state before launching it;
            - "autoswitchToNewTab" (boolean, default true) — auto-switch to newly opened tabs;
            - "baseUrl" (string) — URL to navigate to automatically after driver start, e.g. "https://example.com";
            - "changeAnalysis" (boolean, default true) — enable UI changes analysis agent;
            - "cookies" (array) — cookies to set, supported for Selenium and Playwright, e.g. [{"name": "session", "value": "abc123", "domain": ".example.com"}];
            - "device" (string or object) — the device to run on, e.g. "iPhone 16" (Playwright built-in preset name or a custom object with viewport/userAgent/deviceScaleFactor/isMobile/hasTouch, iOS real device unique device identifier, Android/iOS simulator name, etc.).
            - "excludeAttributes" (string[]) — accessibility attributes to exclude from the tree, e.g., ["src"];
            - "executablePath" (string) — path to a custom Chrome executable;
            - "fullPageScreenshot" (boolean, default false) — capture full-page screenshots.
            - "headers" (object) — extra HTTP headers, supported for Selenium and Playwright. A string value is sent with every request, e.g. {"Authorization": "Bearer token"}; an object value is sent only to hosts matching the key, e.g. {".example.com": {"X-Feature": "on"}};
            - "headless" (boolean, default false) — run browser headless, supported for Selenium and Playwright;
            - "navigationPolicy" (object) — domain allowlist/denylist for navigation, e.g. {"allowedDomains": ["(^|\\.)example\\.com$"], "deniedDomains": ["internal"]}. Both fields are string[] of case-insensitive regex patterns matched against the hostname and full URL. When "allowedDomains" is non-empty, only matching URLs are allowed; otherwise everything is allowed except "deniedDomains" matches. Link-local/metadata IPs and file:// are always blocked;
            - "newTabTimeout" (number, default 10000) — maximum ms to wait after a new tab is announced, Playwright only;
            - "permissions" (string[]) — browser permissions to grant, Playwright only, e.g. ["camera"];
            - "planner" (boolean) — enable/disable planner agent;
            - "profile" (string) — name of a persistent browser profile; cookies, sessions, and storage are preserved across restarts in ~/.alumnium/profiles/{name}, e.g. "personal";
            - "proxy" (object) — HTTP/HTTPS/SOCKS5 proxy, supported for Selenium and Playwright, e.g. {"server": "http://myproxy.com:3128", "bypass": ".com, chromium.org", "username": "usr", "password": "pwd"}; if omitted, the http_proxy/HTTP_PROXY/https_proxy/HTTPS_PROXY environment variables are used automatically;
            - "recordVideos" (boolean, default true) — record video of the browser session, Playwright only. Can also be disabled via ALUMNIUM_MCP_RECORD_VIDEOS=false;
            - "userAgent" (string) — custom User-Agent header sent with every request, supported for Selenium and Playwright.

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
    const navigationPolicy = parseNavigationPolicyOption(
      alumniumOptions["navigationPolicy"],
    );

    // Validate the domain policy immediately, before a browser/Appium process is spawned below —
    // NavigationPolicy.create() throws on a malformed pattern; the result is discarded here and
    // rebuilt (cheaply) inside `new Alumni()`.
    try {
      NavigationPolicy.create(navigationPolicy ?? {});
    } catch (error) {
      const message = `Invalid domain policy configuration: ${error}`;
      logger.error(message);
      throw new Error(message);
    }

    // Generate driver ID from current directory and timestamp
    const cwdName = path.basename(process.cwd());
    const timestamp = Math.floor(Date.now() / 1000);
    const id = McpState.generateDriverId(`${cwdName}-${timestamp}`);

    // Create directories
    const artifactsStore = new McpArtifactsStore(id);
    const profilesStore = new McpProfilesStore();

    const device = parseDeviceOption(alumniumOptions["device"]);

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
      ...(typeof alumniumOptions["userAgent"] === "string" && {
        userAgent: alumniumOptions["userAgent"],
      }),
      ...(device !== undefined && { device }),
      ...(typeof alumniumOptions["proxy"] === "object" &&
        alumniumOptions["proxy"] !== null &&
        typeof (alumniumOptions["proxy"] as Record<string, unknown>)[
          "server"
        ] === "string" && {
          proxy: alumniumOptions["proxy"] as {
            server: string;
            bypass?: string;
            username?: string;
            password?: string;
          },
        }),
      ...(typeof alumniumOptions["recordVideos"] === "boolean" && {
        recordVideos: alumniumOptions["recordVideos"],
      }),
    };

    // Shared mobile options, translated per driver in `createMobileDriver`.
    const mobileOptions: McpDriver.MobileOptions = {
      ...(typeof alumniumOptions["app"] === "string" && {
        app: alumniumOptions["app"],
      }),
      ...(typeof device === "string" && { device }),
      ...(typeof alumniumOptions["appReset"] === "boolean" && {
        appReset: alumniumOptions["appReset"],
      }),
      ...(Array.isArray(alumniumOptions["appArguments"]) && {
        appArguments: alumniumOptions["appArguments"].filter(
          (value): value is string => typeof value === "string",
        ),
      }),
      ...(typeof alumniumOptions["appEnvironment"] === "object" &&
        alumniumOptions["appEnvironment"] !== null &&
        !Array.isArray(alumniumOptions["appEnvironment"]) &&
        Object.values(alumniumOptions["appEnvironment"]).every(
          (value) => typeof value === "string",
        ) && {
          appEnvironment: alumniumOptions["appEnvironment"] as Record<
            string,
            string
          >,
        }),
    };

    const alumniumOptionsNonDriverKeys = new Set([
      "app",
      "appArguments",
      "appEnvironment",
      "appReset",
      "baseUrl",
      "changeAnalysis",
      "cookies",
      "device",
      "excludeAttributes",
      "executablePath",
      "headers",
      "headless",
      "navigationPolicy",
      "permissions",
      "planner",
      "proxy",
      "recordVideos",
      "userAgent",
    ]);
    const driverSettings: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(alumniumOptions)) {
      if (!alumniumOptionsNonDriverKeys.has(key)) {
        driverSettings[key] = value;
      }
    }

    logger.info(`Starting driver ${id} for platform: ${platformName}`);

    const platform = Driver.Platform.safeParse(platformName).data;
    let driver: McpDriver;
    switch (platform) {
      case "chromium": {
        driver = await tracer.span(
          "mcp.driver.start",
          {
            "mcp.driver.id": id,
            "driver.kind": "playwright",
            "driver.platform": platform,
          },
          () =>
            createChromeDriver(
              capabilities,
              serverUrl,
              artifactsStore,
              driverOptions,
            ),
        );
        break;
      }

      case "ios":
      case "android":
        {
          driver = await tracer.span(
            "mcp.driver.start",
            {
              "mcp.driver.id": id,
              "driver.kind":
                Env.ALUMNIUM_DRIVER === "maestro" ? "maestro" : "appium",
              "driver.platform": platform,
            },
            () =>
              createMobileDriver(
                platform,
                capabilities,
                serverUrl,
                mobileOptions,
              ),
          );
        }
        break;

      case undefined:
        logger.error(`Unsupported platformName: ${platformName}`);
        throw new Error(
          `Unsupported platformName: ${platformName}. Supported values: chrome, chromium, ios, android`,
        );

      default:
        never(platform);
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
      navigationPolicy,
    });

    // Register driver in global state before the first navigation so a
    // failure below still leaves a tracked driver that exit hooks can clean up
    McpState.registerDriver(id, al, driver, artifactsStore);

    // Apply driver options to Alumnium driver
    if (Object.keys(driverSettings).length) {
      logger.debug(`Applying driver options: {driverSettings}`, {
        driverSettings,
      });
      for (const [key, value] of Object.entries(driverSettings)) {
        if (key in al.driver) {
          try {
            // @ts-expect-error -- Driver settings are applied dynamically by name.
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
