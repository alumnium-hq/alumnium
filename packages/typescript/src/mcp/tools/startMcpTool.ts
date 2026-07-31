import { never } from "alwaysly";
import fs from "node:fs";
import path from "node:path";
import z from "zod";
import { Alumni } from "../../client/Alumni.ts";
import { NativeClient } from "../../clients/NativeClient.ts";
import { Driver } from "../../drivers/Driver.ts";
import { Params } from "../../Params.ts";
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
import {
  createAppiumDriver,
  createChromeDriver,
  type McpDriver,
} from "../mcpDrivers.ts";
import { McpProfilesStore } from "../McpProfilesStore.ts";
import { McpState } from "../McpState.ts";
import { McpTool } from "./McpTool.ts";

const { tracer } = Telemetry.get(import.meta.url);

export namespace startMcpTool {
  /** The parameterizable inputs of `start`, and the values for them. */
  export interface ParamsInput {
    capabilities: string;
    server_url?: string | undefined;
    params?: Record<string, string> | undefined;
  }

  export interface ResolvedParams {
    /** Capabilities reference: a file path, or inline JSON. */
    capabilities: string;
    serverUrl: string | null;
  }
}

/**
 * Substitutes the `{placeholder}` tokens of `capabilities` and `server_url`.
 *
 * Both are substituted in `structured` mode: their braces are a path or JSON
 * rather than prose, and running prose substitution over inline capabilities
 * would collapse the closing braces of a nested option (`proxy`, `cookies`) and
 * quietly leave the JSON unparseable. See `Params.Mode`.
 *
 * The capabilities are substituted before the file is looked for, so that a
 * run-scoped path segment resolves — which is the point: a recorded
 * `.../runs/{session_id}/artifacts/capabilities.json` otherwise replays against
 * the recording run's directory, starting the browser with that run's cookies.
 * Inline JSON passes through the same call, its own braces untouched.
 *
 * NOTE: Text read out of a capabilities file is deliberately not substituted.
 * Only what the tool was called with is.
 *
 * @param input - Recorded `start` tool input.
 * @returns The capabilities reference and server URL to use.
 * @throws ParamsError When a value is not referenced by either field.
 */
export function resolveStartParams(
  input: startMcpTool.ParamsInput,
): startMcpTool.ResolvedParams {
  const boundParams = Params.from(input.params);

  // NOTE: Validated against both fields a value can land in, so that a value
  // used only in the server URL is not reported as unreferenced.
  boundParams.validate(
    [input.capabilities, input["server_url"] ?? ""].join("\n"),
    "capabilities",
    "structured",
  );

  const serverUrl =
    typeof input["server_url"] === "string"
      ? boundParams.substitute(input["server_url"], "structured")
      : null;

  return {
    capabilities: boundParams.substitute(input.capabilities, "structured"),
    serverUrl,
  };
}

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

    params: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Values for the `{placeholder}` tokens in `capabilities` and `server_url`, e.g. capabilities \'/tmp/runs/{session_id}/capabilities.json\' with params {"session_id": "eca3fa90"}. ' +
          "Substituted into the capabilities file path or inline JSON and into the server URL, so a run-scoped path is resolved freshly on every run instead of pointing at an earlier run's directory. " +
          "Braces that are part of inline JSON are left alone. Every value must be referenced by one of those two fields.",
      ),
  }),

  async execute(input, { logger }) {
    const { capabilities: capabilitiesRef, serverUrl: substitutedServerUrl } =
      resolveStartParams(input);

    // Resolve capabilities: file path or inline JSON string
    let rawCapabilities: string;
    const filePath = path.resolve(capabilitiesRef);
    if (fs.existsSync(filePath)) {
      try {
        rawCapabilities = fs.readFileSync(filePath, "utf-8");
      } catch (error) {
        const message = `Failed to read capabilities file '${filePath}': ${error}`;
        logger.error(message);
        throw new Error(message);
      }
    } else {
      rawCapabilities = capabilitiesRef;
    }

    // Parse capabilities JSON
    let capabilities: Record<string, unknown>;
    try {
      capabilities = JSON.parse(rawCapabilities);
    } catch (error) {
      // NOTE: The resolved path is named too. A capabilities path whose
      // placeholder was substituted with the wrong value is not a file, so it
      // falls through to being parsed as JSON and lands here.
      const message = `Invalid JSON in capabilities parameter '${filePath}': ${error}`;
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

    const serverUrl = substitutedServerUrl;

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
      ...(typeof alumniumOptions["userAgent"] === "string" && {
        userAgent: alumniumOptions["userAgent"],
      }),
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

    // Detect platform and create appropriate driver
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

      case "xcuitest":
      case "uiautomator2":
        {
          driver = await tracer.span(
            "mcp.driver.start",
            {
              "mcp.driver.id": id,
              "driver.kind": "appium",
              "driver.platform": platform,
            },
            () => createAppiumDriver(platform, capabilities, serverUrl),
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
