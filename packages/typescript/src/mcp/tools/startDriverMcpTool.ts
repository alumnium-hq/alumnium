import fs from "node:fs";
import path from "node:path";
import z from "zod";
import { Alumni } from "../../client/Alumni.ts";
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
  createAndroidDriver,
  createChromeDriver,
  createIosDriver,
  type McpDriver,
} from "../mcpDrivers.ts";
import { McpState } from "../McpState.ts";
import { McpTool } from "./McpTool.ts";

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
        `JSON string or path to a JSON file with Selenium/Appium/Playwright capabilities. Must include 'platformName' (e.g., 'chrome', 'iOS', 'Android'). Example JSON string: '{"platformName": "iOS", "appium:deviceName": "iPhone 16", "appium:platformVersion": "18.0"}'. Example file path: '/path/to/capabilities.json'. You can optionally set extra HTTP headers. Example: '{"headers": {"Authorization": "Bearer token"}}'. You can optionally set cookies. Example: '{"cookies": [{"name": "session", "value": "abc123", "domain": ".example.com"}]}'.`,
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
        logger.error(`Failed to read capabilities file '${filePath}': ${error}`);
        throw new Error(`Failed to read capabilities file '${filePath}': ${error}`);
      }
    } else {
      rawCapabilities = input.capabilities;
    }

    // Parse capabilities JSON
    let capabilities: Record<string, unknown>;
    try {
      capabilities = JSON.parse(rawCapabilities);
    } catch (error) {
      logger.error(`Invalid JSON in capabilities parameter: ${error}`);
      throw new Error(`Invalid JSON in capabilities parameter: ${error}`);
    }

    // Extract and validate platformName
    if (
      typeof capabilities.platformName !== "string" ||
      !capabilities.platformName
    ) {
      logger.error("Capabilities must include 'platformName' field");
      throw new Error("Capabilities must include 'platformName' field");
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
    const driverId = `${cwdName}-${timestamp}`;

    logger.info(`Starting driver ${driverId} for platform: ${platformName}`);

    // Create artifacts directories
    const artifactsStore = new McpArtifactsStore(driverId);

    // Detect platform and create appropriate driver
    let driver: McpDriver;
    if (["chrome", "chromium"].includes(platformName)) {
      driver = await createChromeDriver(
        capabilities,
        serverUrl,
        artifactsStore,
      );
    } else if (platformName === "ios") {
      driver = await createIosDriver(capabilities, serverUrl);
    } else if (platformName === "android") {
      driver = await createAndroidDriver(capabilities, serverUrl);
    } else {
      logger.error(`Unsupported platformName: ${platformName}`);
      throw new Error(
        `Unsupported platformName: ${platformName}. Supported values: chrome, chromium, ios, android`,
      );
    }

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

    // Apply driver options to Alumnium driver
    if (Object.keys(driverSettings).length) {
      logger.debug(`Applying driver options: {driverSettings}`, {
        driverSettings,
      });
      for (const [key, value] of Object.entries(driverSettings)) {
        if (key in al.driver) {
          // @ts-expect-error
          al.driver[key] = value;
          logger.debug(`Set driver option ${key}={value}`, { value });
        } else {
          logger.warn(`Unknown driver option: ${key}`);
        }
      }
    }

    // Register driver in global state
    McpState.registerDriver(driverId, al, driver, artifactsStore);

    return [
      {
        type: "text",
        text: JSON.stringify({
          driver_id: driverId,
          driver_type: al.driver.constructor.name,
          platform_name: platformName,
          model: `${al.model.provider}/${al.model.name}`,
        }),
      },
    ];
  },
});
