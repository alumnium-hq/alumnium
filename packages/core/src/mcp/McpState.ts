/**
 * @module MCP State
 * State management for MCP server driver instances.
 */

import { always } from "alwaysly";
import path from "node:path";
import { Alumni } from "../client/Alumni.js";
import { PlaywrightDriver } from "../drivers/PlaywrightDriver.js";
import { LlmUsageStats } from "../llm/llmSchema.js";
import { getLogger } from "../utils/logger.js";
import { McpDriver } from "./mcpDrivers.js";
import { startDriverMcpTool } from "./tools/startDriverMcpTool.js";

const logger = getLogger(import.meta.url);

export namespace McpState {
  export type DriverPair = [Alumni, McpDriver];
}

export abstract class McpState {
  // Global state for driver management
  static drivers: Record<string, McpState.DriverPair> = {}; // driver_id -> (Alumni instance, raw driver)
  static artifactsDirs: Record<string, string> = {}; // driver_id -> artifacts directory path
  static stepCounters: Record<string, number> = {}; // driver_id -> current step number

  /**
   * Register a new driver instance.
   */
  static registerDriver(
    driverId: string,
    al: Alumni,
    rawDriver: McpDriver,
    artifactsDir: string,
  ): void {
    this.drivers[driverId] = [al, rawDriver];
    this.artifactsDirs[driverId] = artifactsDir;
    this.stepCounters[driverId] = 1;
    logger.debug(`Registered driver ${driverId} in state`);
  }

  /**
   * Get driver instance by ID.
   */
  static getDriver(driverId: string): McpState.DriverPair {
    const driverEntry = this.drivers[driverId];
    if (!driverEntry) {
      logger.error(`Driver ${driverId} not found`);
      throw new Error(
        `Driver ${driverId} not found. Call ${startDriverMcpTool.name} first.`,
      );
    }
    return driverEntry;
  }

  /**
   * Clean up driver and return artifacts directory and stats.
   */
  static async cleanupDriver(
    driverId: string,
  ): Promise<[string, LlmUsageStats]> {
    const driverEntry = this.drivers[driverId];
    if (!driverEntry) {
      logger.error(`Driver ${driverId} not found for cleanup`);
      throw new Error(`Driver ${driverId} not found.`);
    }
    logger.debug(`Cleaning up driver ${driverId}`);

    const [al, driver] = driverEntry;
    const stats = await al.getStats();
    const artifactsDir = this.artifactsDirs[driverId];
    always(artifactsDir);

    if (driver instanceof PlaywrightDriver) {
      // Playwright driver

      logger.debug(`Driver ${driverId}: Stopping Playwright tracing`);

      await driver.page
        .context()
        .tracing.stop({ path: path.join(artifactsDir, "trace.zip") });
    }

    await al.quit();

    delete this.drivers[driverId];
    delete this.artifactsDirs[driverId];
    delete this.stepCounters[driverId];

    logger.debug(`Driver ${driverId} cleanup complete`);

    return [artifactsDir, stats];
  }
}
