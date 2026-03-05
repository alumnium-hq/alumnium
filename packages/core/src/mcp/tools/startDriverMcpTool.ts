import { never } from "alwaysly";
import path from "node:path";
import z from "zod";
import { Alumni } from "../../client/Alumni.js";
import { ExecuteJavascriptTool } from "../../tools/ExecuteJavascriptTool.js";
import { NavigateBackTool } from "../../tools/NavigateBackTool.js";
import { NavigateToUrlTool } from "../../tools/NavigateToUrlTool.js";
import { ScrollTool } from "../../tools/ScrollTool.js";
import { SwitchToNextTabTool } from "../../tools/SwitchToNextTabTool.js";
import { SwitchToPreviousTabTool } from "../../tools/SwitchToPreviousTabTool.js";
import { getLogger } from "../../utils/logger.js";
import { ensureArtifactsDir } from "../McpArtifacts.js";
import {
  createAndroidDriver,
  createChromeDriver,
  createIosDriver,
  McpDriver,
} from "../mcpDrivers.js";
import { McpState } from "../McpState.js";
import { McpTool } from "./McpTool.js";

const logger = getLogger(import.meta.url);

/**
 * Start a new driver instance.
 */
export const startDriverMcpTool = McpTool.define("start_driver", {
  description:
    "Initialize a browser driver for automated testing. Returns a driver_id for use in other calls.",

  inputSchema: z.object({
    capabilities: z
      .string()
      .describe(
        `JSON string with Selenium/Appium/Playwright capabilities. Must include 'platformName' (e.g., 'chrome', 'iOS', 'Android'). Example: '{"platformName": "iOS", "appium:deviceName": "iPhone 16", "appium:platformVersion": "18.0"}'. You can optionally set extra HTTP headers. Example: '{"headers": {"Authorization": "Bearer token"}}'. You can optionally set cookies. Example: '{"cookies": [{"name": "session", "value": "abc123", "domain": ".example.com"}]}'.`,
      ),

    server_url: z
      .string()
      .describe(
        "Optional remote Selenium/Appium server URL. Examples: 'http://localhost:4723', 'https://mobile-hub.lambdatest.com/wd/hub'. Defaults to local driver (Chrome) or localhost:4723 (Appium)",
      )
      .optional(),
  }),

  async execute(input) {
    // Parse capabilities JSON
    let capabilities: Record<string, unknown>;
    try {
      capabilities = JSON.parse(input.capabilities);
    } catch (error) {
      logger.error(`Invalid JSON in capabilities parameter: ${error}`);
      throw new Error(`Invalid JSON in capabilities parameter: ${error}`);
    }

    // Extract and validate platformName
    if (
      typeof capabilities.platformName !== "string" ||
      !capabilities.platformName
    ) {
      logger.error("capabilities must include 'platformName' field");
      throw new Error("capabilities must include 'platformName' field");
    }

    const platformName = capabilities.platformName.toLowerCase();
    const serverUrl =
      typeof input["server_url"] === "string" ? input["server_url"] : null;

    // Extract alumnium:options for Alumnium driver configuration
    const alumniumOptions =
      (capabilities["alumnium:options"] as
        | Record<string, unknown>
        | undefined) || {};
    delete capabilities["alumnium:options"];
    const driverSettings =
      (alumniumOptions["driverSettings"] as
        | Record<string, unknown>
        | undefined) || {};
    const planner =
      typeof alumniumOptions["planner"] === "boolean"
        ? alumniumOptions["planner"]
        : undefined;
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
    const driverId = `${cwdName}-${timestamp}`;

    logger.info(`Starting driver ${driverId} for platform: ${platformName}`);

    // Create artifacts directories
    const artifactsDir = await ensureArtifactsDir(driverId);

    // Detect platform and create appropriate driver
    let driver: McpDriver;
    let platformLabel: string;
    if (["chrome", "chromium"].includes(platformName)) {
      driver = await createChromeDriver(capabilities, serverUrl, artifactsDir);
      platformLabel = "Chrome";
    } else if (platformName === "ios") {
      never();
      driver = await createIosDriver(capabilities, serverUrl);
      platformLabel = "iOS";
    } else if (platformName === "android") {
      never();
      driver = await createAndroidDriver(capabilities, serverUrl);
      platformLabel = "Android";
    } else {
      logger.error(`Unsupported platformName: ${platformName}`);
      throw new Error(
        `Unsupported platformName: ${platformName}. Supported values: chrome, chromium, ios, android`,
      );
    }

    const al = new Alumni(driver, {
      extraTools: [
        ExecuteJavascriptTool,
        NavigateBackTool,
        NavigateToUrlTool,
        ScrollTool,
        SwitchToNextTabTool,
        SwitchToPreviousTabTool,
      ],
      planner,
      excludeAttributes,
    });

    // Apply driver options to Alumnium driver
    if (Object.keys(driverSettings).length) {
      logger.debug(
        `Applying driver options: ${JSON.stringify(driverSettings)}`,
      );
      for (const [key, value] of Object.entries(driverSettings)) {
        // Convert camelCase to snake_case
        const snakeKey = key
          .split("")
          .map((char) =>
            char === char.toUpperCase() && char !== char.toLowerCase()
              ? `_${char.toLowerCase()}`
              : char,
          )
          .join("")
          .replace(/^_/, "");

        if (snakeKey in al.driver) {
          // @ts-expect-error -- TODO
          al.driver[snakeKey] = value;
          logger.debug(`Set driver option ${snakeKey}=${String(value)}`);
        } else {
          logger.warn(`Unknown driver option: ${key}`);
        }
      }
    }

    // Register driver in global state
    McpState.registerDriver(driverId, al, driver, artifactsDir);

    logger.info(
      `Driver ${driverId} started successfully. Platform: ${platformLabel}, Model: ${al.model.provider}/${al.model.name}`,
    );

    return [
      {
        type: "text",
        text: `${platformLabel} driver started successfully (driver_id: ${driverId})\nModel: ${al.model.provider}/${al.model.name}`,
      },
    ];
  },
});
