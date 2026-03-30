/**
 * @module MCP State
 * State management for MCP server driver instances.
 */

import { Alumni } from "../client/Alumni.js";
import { PlaywrightDriver } from "../drivers/PlaywrightDriver.js";
import { LlmUsageStats } from "../llm/llmSchema.js";
import { getLogger } from "../utils/logger.js";
import { McpArtifactsStore } from "./McpArtifactsStore.js";
import type { McpDriver } from "./mcpDrivers.js";
import { startDriverMcpTool } from "./tools/startDriverMcpTool.js";

const logger = getLogger(import.meta.url);

export namespace McpState {
  export type DriverPair = [Alumni, McpDriver];

  export interface Driver {
    readonly al: Alumni;
    readonly mcpDriver: McpDriver;
    readonly artifactsStore: McpArtifactsStore;
    stepCounter: number;
  }
}

export abstract class McpState {
  // Global state for driver management
  private static drivers: Record<string, McpState.Driver> = {}; // driver_id -> driver state

  private static cleanupHooksRegistered = false;
  private static cleanupAllPromise: Promise<void> | null = null;

  /**
   * Register a new driver instance.
   */
  static registerDriver(
    driverId: string,
    al: Alumni,
    mcpDriver: McpDriver,
    artifactsStore: McpArtifactsStore,
  ): void {
    this.registerCleanupHooks();

    this.drivers[driverId] = {
      al,
      mcpDriver,
      artifactsStore: artifactsStore,
      stepCounter: 1,
    };

    logger.debug(`Registered driver ${driverId}`);
  }

  /**
   * Get driver's Alumni instance by driver ID.
   */
  static getDriverAlumni(driverId: string): Alumni {
    const driverState = this.getDriverState(driverId);
    return driverState.al;
  }

  /**
   * Increment driver step counter and return new step number.
   *
   * @param driverId Driver ID.
   * @returns New step number after increment.
   */
  static incrementStepNum(driverId: string): number {
    const driverState = this.getDriverState(driverId);
    const newStepCounter = driverState.stepCounter++;
    return newStepCounter;
  }

  /**
   * Get driver state by ID.
   */
  static getDriverState(driverId: string): McpState.Driver {
    const driverState = this.drivers[driverId];
    if (!driverState) {
      logger.error(`Driver state for ${driverId} not found`);
      // NOTE: This error is required for the controlling agent calling MCP.
      throw new Error(
        `Driver ${driverId} not found. Call ${startDriverMcpTool.name} first.`,
      );
    }
    return driverState;
  }

  /**
   * Clean up driver and return artifacts directory and stats.
   */
  static async cleanupDriver(
    driverId: string,
  ): Promise<[string, LlmUsageStats]> {
    const driverState = this.getDriverState(driverId);

    logger.debug(`Cleaning up driver ${driverId}`);

    const { al, mcpDriver } = driverState;
    const stats = await al.getStats();

    if (mcpDriver instanceof PlaywrightDriver) {
      logger.debug(`Driver ${driverId}: Stopping Playwright tracing`);

      const tracePath =
        await driverState.artifactsStore.ensureFilePath("trace.zip");
      await mcpDriver.page.context().tracing.stop({ path: tracePath });
    }

    // Save token stats to JSON file
    const statsPath = await driverState.artifactsStore.writeJson(
      "token-stats.json",
      stats,
    );
    logger.info(`Driver ${driverId}: Token stats saved to ${statsPath}`);

    await al.quit();

    delete this.drivers[driverId];

    logger.debug(`Driver ${driverId} cleanup complete`);

    return [driverState.artifactsStore.dir, stats];
  }

  static async cleanupAllDrivers(): Promise<void> {
    const driverIds = Object.keys(this.drivers);
    await Promise.all(
      driverIds.map(async (driverId) => {
        logger.debug(`Exit hook: stopping driver ${driverId}`);
        await this.cleanupDriver(driverId).catch((err) => {
          logger.debug(
            `Exit hook: error stopping driver ${driverId}: {error}`,
            { error: err },
          );
        });
      }),
    );
  }

  static clear() {
    this.drivers = {};
    this.cleanupAllPromise = null;
  }

  private static registerCleanupHooks(): void {
    if (this.cleanupHooksRegistered) return;

    process.once("beforeExit", () => void this.cleanupAllDriversOnce());

    process.once(
      "SIGINT",
      () => void this.cleanupAllDriversOnce().finally(() => process.exit(0)),
    );

    process.once(
      "SIGTERM",
      () => void this.cleanupAllDriversOnce().finally(() => process.exit(0)),
    );

    logger.debug("Registered MCP cleanup hooks");

    this.cleanupHooksRegistered = true;
  }

  private static cleanupAllDriversOnce(): Promise<void> {
    if (!this.cleanupAllPromise) {
      this.cleanupAllPromise = this.cleanupAllDrivers().finally(() => {
        this.cleanupAllPromise = null;
      });
    }

    return this.cleanupAllPromise;
  }
}
