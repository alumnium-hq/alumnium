/** Tool handlers for MCP server. */

import fs from "node:fs";
import path from "node:path";
// @ts-expect-error -- TODO: Missing Python API
import { Alumni } from "../index.js";
import {
  ExecuteJavascriptTool,
  NavigateBackTool,
  NavigateToUrlTool,
  ScrollTool,
  SwitchToNextTabTool,
  SwitchToPreviousTabTool,
} from "../tools/index.js";
import { getLogger } from "../utils/logger.js";
import * as drivers from "./drivers.js";
import * as screenshots from "./screenshots.js";
import * as state from "./state.js";

const logger = getLogger(import.meta.url);

interface TextContent {
  type: "text";
  text: string;
}

type HandlerResult = Promise<TextContent[]>;

interface AlumniumLike {
  client: unknown;
  driver: unknown;
  model: unknown;
  cache: unknown;
  do(goal: string): {
    explanation: string;
    steps: Array<{ name: string; tools: unknown[] }>;
  };
  check(statement: string, args?: { vision?: boolean }): string;
  get(data: string, args?: { vision?: boolean }): unknown;
}

// Base directory for MCP artifacts (screenshots, logs, etc.)
// Defaults to OS temp directory, can be configured via environment variable
const ARTIFACTS_DIR = process.env.ALUMNIUM_MCP_ARTIFACTS_DIR || "tmp/alumnium";

export async function handleStartDriver(
  args: Record<string, unknown>,
): HandlerResult {
  /** Start a new driver instance. */
  // Parse capabilities JSON
  let capabilities: Record<string, unknown>;
  try {
    capabilities = JSON.parse(String(args["capabilities"]));
  } catch (error) {
    logger.error(`Invalid JSON in capabilities parameter: ${error}`);
    throw new Error(`Invalid JSON in capabilities parameter: ${error}`);
  }

  // Extract and validate platformName
  if (!("platformName" in capabilities)) {
    logger.error("capabilities must include 'platformName' field");
    throw new Error("capabilities must include 'platformName' field");
  }

  const platformName = String(capabilities["platformName"]).toLowerCase();
  const serverUrl =
    typeof args["server_url"] === "string" ? args["server_url"] : null;

  // Extract alumnium:options for Alumnium driver configuration
  const alumniumOptions =
    (capabilities["alumnium:options"] as Record<string, unknown> | undefined) ||
    {};
  delete capabilities["alumnium:options"];
  const driverSettings =
    (alumniumOptions["driverSettings"] as
      | Record<string, unknown>
      | undefined) || {};

  // Generate driver ID from current directory and timestamp
  const cwdName = path.basename(process.cwd());
  const timestamp = Math.floor(Date.now() / 1000);
  const driverId = `${cwdName}-${timestamp}`;

  logger.info(`Starting driver ${driverId} for platform: ${platformName}`);

  // Create artifacts directories
  const artifactsDir = path.join(ARTIFACTS_DIR, driverId);
  fs.mkdirSync(artifactsDir, { recursive: true });

  // Detect platform and create appropriate driver
  let driver: unknown;
  let platformLabel: string;
  if (["chrome", "chromium"].includes(platformName)) {
    driver = await drivers.createChromeDriver(
      capabilities,
      serverUrl,
      artifactsDir,
    );
    platformLabel = "Chrome";
  } else if (platformName === "ios") {
    driver = await drivers.createIosDriver(capabilities, serverUrl);
    platformLabel = "iOS";
  } else if (platformName === "android") {
    driver = await drivers.createAndroidDriver(capabilities, serverUrl);
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
  }) as AlumniumLike;

  // Apply driver options to Alumnium driver
  if (Object.keys(driverSettings).length) {
    logger.debug(`Applying driver options: ${JSON.stringify(driverSettings)}`);
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

      // @ts-expect-error -- TODO: Missing Python API
      if (snakeKey in al.driver) {
        // @ts-expect-error -- TODO: Missing Python API
        al.driver[snakeKey] = value;
        logger.debug(`Set driver option ${snakeKey}=${String(value)}`);
      } else {
        logger.warn(`Unknown driver option: ${key}`);
      }
    }
  }

  // Register driver in global state
  // @ts-expect-error -- TODO: Missing Python API
  state.registerDriver(driverId, al, driver, artifactsDir);

  logger.info(
    // @ts-expect-error -- TODO: Missing Python API
    `Driver ${driverId} started successfully. Platform: ${platformLabel}, Model: ${al.model.provider.value}/${al.model.name}`,
  );

  return [
    {
      type: "text",
      // @ts-expect-error -- TODO: Missing Python API
      text: `${platformLabel} driver started successfully (driver_id: ${driverId})\nModel: ${al.model.provider.value}/${al.model.name}`,
    },
  ];
}

export async function handleDo(args: Record<string, unknown>): HandlerResult {
  /** Execute Alumni.do(). */
  const driverId = String(args["driver_id"]);
  const goal = String(args["goal"]);

  logger.info(`Driver ${driverId}: Executing do('${goal}')`);

  const [al] = state.getDriver(driverId);
  // @ts-expect-error -- TODO: Missing Python API
  const client = al.client;
  // @ts-expect-error -- TODO: Missing Python API
  const beforeTree = al.driver.accessibility_tree.to_str();
  const beforeUrl = await al.driver.url();
  // @ts-expect-error -- TODO: Missing Python API
  const result = al.do(goal) as {
    explanation: string;
    steps: Array<{ name: string; tools: unknown[] }>;
  };

  logger.debug(
    `Driver ${driverId}: do() completed with ${result.steps.length} steps`,
  );
  screenshots.saveScreenshot(driverId, goal, al);

  // Build structured response
  const performedSteps = result.steps.map((step) => ({
    name: step.name,
    tools: step.tools,
  }));

  let changes = "";
  if (result.steps.length) {
    try {
      // @ts-expect-error -- TODO: Missing Python API
      const afterTree = al.driver.accessibility_tree.to_str();
      const afterUrl = await al.driver.url();
      // @ts-expect-error -- TODO: Missing Python API
      changes = client.analyzeChanges({
        before_accessibility_tree: beforeTree,
        before_url: beforeUrl,
        after_accessibility_tree: afterTree,
        after_url: afterUrl,
      });
    } catch (error) {
      logger.error(`Driver ${driverId}: Error analyzing changes: ${error}`);
    }
  }

  const response: {
    explanation: string;
    performed_steps: Array<{ name: string; tools: unknown[] }>;
    changes?: string;
  } = {
    explanation: result.explanation,
    performed_steps: performedSteps,
  };
  if (changes) {
    response["changes"] = changes;
  }

  return [{ type: "text", text: JSON.stringify(response, null, 2) }];
}

export async function handleCheck(
  args: Record<string, unknown>,
): HandlerResult {
  /** Execute Alumni.check(). */
  const driverId = String(args["driver_id"]);
  const statement = String(args["statement"]);
  const vision = Boolean(args["vision"] || false);

  logger.info(
    `Driver ${driverId}: Executing check('${statement}', vision=${vision})`,
  );

  const [al] = state.getDriver(driverId);

  let explanation = "";
  let result = "";
  try {
    // @ts-expect-error -- TODO: Missing Python API
    explanation = al.check(statement, { vision });
    result = "passed";
    logger.debug(`Driver ${driverId}: check() passed: ${explanation}`);
  } catch (error) {
    explanation = String(error);
    result = "failed";
    logger.debug(`Driver ${driverId}: check() failed: ${explanation}`);
  }

  await screenshots.saveScreenshot(driverId, `check ${statement}`, al);

  return [{ type: "text", text: `Check ${result}! ${explanation}` }];
}

export async function handleGet(args: Record<string, unknown>): HandlerResult {
  /** Execute Alumni.get(). */
  const driverId = String(args["driver_id"]);
  const data = String(args["data"]);
  const vision = Boolean(args["vision"] || false);

  logger.info(`Driver ${driverId}: Executing get('${data}', vision=${vision})`);

  const [al] = state.getDriver(driverId);
  const result = await al.get(data, { vision });
  logger.debug(`Driver ${driverId}: get() extracted data: ${String(result)}`);
  await screenshots.saveScreenshot(driverId, `get ${data}`, al);

  return [{ type: "text", text: String(result) }];
}

export async function handleFetchAccessibilityTree(
  args: Record<string, unknown>,
): HandlerResult {
  /** Fetch accessibility tree for debugging. */
  const driverId = String(args["driver_id"]);

  logger.debug(`Driver ${driverId}: Getting accessibility tree`);

  const [al] = state.getDriver(driverId);
  // Access the internal driver's accessibility tree
  // as if it's processed by Alumnium server
  // @ts-expect-error -- TODO: Missing Python API
  const client = al.client;
  // @ts-expect-error -- TODO: Missing Python API
  const tree = client.session.process_tree(
    // @ts-expect-error -- TODO: Missing Python API
    al.driver.accessibility_tree.to_str(),
  );

  return [{ type: "text", text: `Accessibility Tree:\n${tree.to_xml()}` }];
}

export async function handleStopDriver(
  args: Record<string, unknown>,
): HandlerResult {
  /** Stop driver and cleanup. */
  const driverId = String(args["driver_id"]);
  const saveCache = Boolean(args["save_cache"] || false);

  logger.info(`Driver ${driverId}: Stopping driver (save_cache=${saveCache})`);

  // Save cache if requested
  if (saveCache) {
    const [al] = state.getDriver(driverId);
    await al.cache.save();
    logger.info(`Driver ${driverId}: Cache saved`);
  }

  // Cleanup driver and get stats
  const [artifactsDir, stats] = await state.cleanupDriver(driverId);

  // Save token stats to JSON file
  const statsFile = path.join(artifactsDir, "token-stats.json");
  fs.writeFileSync(statsFile, JSON.stringify(stats, null, 2));
  logger.info(`Driver ${driverId}: Token stats saved to ${statsFile}`);

  logger.info(
    // @ts-expect-error -- TODO: Missing Python API
    `Driver ${driverId}: Closed. Total tokens: ${stats["total"]["total_tokens"]}, Cached tokens: ${stats["cache"]["total_tokens"]}`,
  );

  // Format stats message with detailed cache breakdown
  const message =
    // @ts-expect-error -- TODO: Missing Python API
    `Driver ${driverId} closed.\nArtifacts saved to: ${path.resolve(artifactsDir)}\nToken usage statistics:\n- Total: ${stats["total"]["total_tokens"]} tokens (${stats["total"]["input_tokens"]} input, ${stats["total"]["output_tokens"]} output)\n- Cached: ${stats["cache"]["total_tokens"]} tokens (${stats["cache"]["input_tokens"]} input, ${stats["cache"]["output_tokens"]} output)`;

  return [{ type: "text", text: message }];
}

export async function handleWait(args: Record<string, unknown>): HandlerResult {
  /** Wait for seconds or a natural language condition. */
  const waitFor = args["for"];

  // If it's a number, wait that many seconds
  if (typeof waitFor === "number") {
    const seconds = Math.max(1, Math.min(30, Math.trunc(waitFor)));
    logger.info(`Waiting for ${seconds} seconds`);
    await Bun.sleep(seconds * 1000);
    return [{ type: "text", text: `Waited ${seconds} seconds` }];
  }

  // Otherwise, treat as natural language condition
  const condition = String(waitFor);
  const driverId =
    typeof args["driver_id"] === "string" ? args["driver_id"] : null;
  if (!driverId) {
    return [
      {
        type: "text",
        text: "driver_id is required when waiting for a condition",
      },
    ];
  }

  const timeout =
    typeof args["timeout"] === "number" ? args["timeout"] : Number(10);
  const pollInterval = 1.0;

  logger.info(
    `Driver ${driverId}: Waiting for '${condition}' (timeout=${timeout}s)`,
  );

  const [al] = state.getDriver(driverId);

  const startTime = Date.now();
  let lastError: string | null = null;
  let attempts = 0;

  while ((Date.now() - startTime) / 1000 < timeout) {
    attempts += 1;
    try {
      const explanation = await al.check(condition);
      logger.info(
        `Driver ${driverId}: Condition met after ${attempts} attempt(s)`,
      );
      return [
        { type: "text", text: `Condition met: ${condition}\n${explanation}` },
      ];
    } catch (error) {
      lastError = String(error);
      logger.debug(
        `Driver ${driverId}: Condition not met (attempt ${attempts})`,
      );
      await Bun.sleep(pollInterval * 1000);
    }
  }

  logger.warn(`Driver ${driverId}: Timeout waiting for '${condition}'`);
  return [
    {
      type: "text",
      text: `Timeout after ${timeout}s waiting for: ${condition}\nLast check: ${lastError}`,
    },
  ];
}
