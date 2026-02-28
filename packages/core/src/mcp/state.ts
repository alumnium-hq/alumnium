/**
 * @module MCP State
 * State management for MCP server driver instances.
 */

import { always } from "alwaysly";
import path from "node:path";
import type { Alumni } from "../client/Alumni.js";
import { PlaywrightDriver } from "../drivers/PlaywrightDriver.js";
import { getLogger } from "../utils/logger.js";
import { McpDriver } from "./drivers.js";
import { MCP_TOOLS } from "./tools.js";

const logger = getLogger(import.meta.url);

export namespace McpState {
  export type DriverPair = [Alumni, McpDriver];
}

// Global state for driver management
export const drivers: Record<string, McpState.DriverPair> = {}; // driver_id -> (Alumni instance, raw driver)
export const artifactsDirs: Record<string, string> = {}; // driver_id -> artifacts directory path
export const stepCounters: Record<string, number> = {}; // driver_id -> current step number

/**
 * Register a new driver instance.
 */
export function registerDriver(
  driverId: string,
  al: Alumni,
  rawDriver: McpDriver,
  artifactsDir: string,
): void {
  drivers[driverId] = [al, rawDriver];
  artifactsDirs[driverId] = artifactsDir;
  stepCounters[driverId] = 1;
  logger.debug(`Registered driver ${driverId} in state`);
}

/**
 * Get driver instance by ID.
 */
export function getDriver(driverId: string): McpState.DriverPair {
  const driverEntry = drivers[driverId];
  if (!driverEntry) {
    logger.error(`Driver ${driverId} not found`);
    throw new Error(
      `Driver ${driverId} not found. Call ${MCP_TOOLS.startDriver.name} first.`,
    );
  }
  return driverEntry;
}

/**
 * Clean up driver and return artifacts directory and stats.
 */
export async function cleanupDriver(
  driverId: string,
): Promise<[string, Record<string, unknown>]> {
  const driverEntry = drivers[driverId];
  if (!driverEntry) {
    logger.error(`Driver ${driverId} not found for cleanup`);
    throw new Error(`Driver ${driverId} not found.`);
  }
  logger.debug(`Cleaning up driver ${driverId}`);

  const [al, driver] = driverEntry;
  const stats = await al.getStats();
  const artifactsDir = artifactsDirs[driverId];
  always(artifactsDir);

  if (driver instanceof PlaywrightDriver) {
    // Playwright driver

    logger.debug(`Driver ${driverId}: Stopping Playwright tracing`);

    await driver.page
      .context()
      .tracing.stop({ path: path.join(artifactsDir, "trace.zip") });
  }

  await al.quit();

  delete drivers[driverId];
  delete artifactsDirs[driverId];
  delete stepCounters[driverId];

  logger.debug(`Driver ${driverId} cleanup complete`);

  return [artifactsDir, stats];
}
