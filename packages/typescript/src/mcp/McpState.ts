/**
 * @module MCP State
 * State management for MCP server driver instances.
 */

import { Alumni } from "../client/Alumni.ts";
import { PlaywrightDriver } from "../drivers/PlaywrightDriver.ts";
import { LlmUsageStats } from "../llm/llmSchema.ts";
import { SystemProcess } from "../system/SystemProcess.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { McpArtifactsStore } from "./McpArtifactsStore.ts";
import type { McpDriver } from "./mcpDrivers.ts";

const { logger, tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

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
  static #drivers: Record<string, McpState.Driver> = {}; // id -> driver state

  /**
   * Register a new driver instance.
   */
  static registerDriver(
    id: string,
    al: Alumni,
    mcpDriver: McpDriver,
    artifactsStore: McpArtifactsStore,
  ): void {
    SystemProcess.useCleanup(this.#cleanupAllDrivers);

    this.#drivers[id] = {
      al,
      mcpDriver,
      artifactsStore: artifactsStore,
      stepCounter: 1,
    };

    logger.debug(`Registered driver ${id}`);
  }

  /**
   * Get driver's Alumni instance by driver ID.
   */
  static getDriverAlumni(id: string): Alumni {
    const driverState = this.getDriverState(id);
    return driverState.al;
  }

  /**
   * Increment driver step counter and return new step number.
   *
   * @param id Driver ID.
   * @returns New step number after increment.
   */
  static incrementStepNum(id: string): number {
    const driverState = this.getDriverState(id);
    const newStepCounter = driverState.stepCounter++;
    return newStepCounter;
  }

  /**
   * Get driver state by ID.
   */
  static getDriverState(id: string): McpState.Driver {
    const driverState = this.#drivers[id];
    if (!driverState) {
      logger.error(`Driver state for ${id} not found`);
      // NOTE: This error is required for the controlling agent calling MCP.
      throw new Error(`Driver ${id} not found. Call start first.`);
    }
    return driverState;
  }

  /**
   * Clean up driver and return artifacts directory and stats.
   */
  @span("mcp.driver.shutdown", (id) => ({ "mcp.driver.id": id }))
  static async cleanupDriver(id: string): Promise<[string, LlmUsageStats]> {
    const driverState = this.getDriverState(id);

    logger.debug(`Cleaning up driver ${id}`);

    const { al } = driverState;
    const stats = await al.getStats();

    if (al.driver instanceof PlaywrightDriver) {
      logger.debug(`Driver ${id}: Stopping Playwright tracing`);

      const tracePath =
        await driverState.artifactsStore.ensureFilePath("trace.zip");
      await al.driver.page.context().tracing.stop({ path: tracePath });
    }

    // Save token stats to JSON file
    const statsPath = await driverState.artifactsStore.writeJson(
      "token-stats.json",
      stats,
    );
    logger.info(`Driver ${id}: Token stats saved to ${statsPath}`);

    await al.quit();

    delete this.#drivers[id];

    tracer.end(id);

    logger.debug(`Driver ${id} cleanup complete`);

    return [driverState.artifactsStore.dir, stats];
  }

  static #cleanupAllDrivers = async () => {
    const ids = Object.keys(this.#drivers);
    await Promise.all(
      ids.map(async (id) => {
        logger.debug(`Exit hook: stopping driver ${id}`);
        await this.cleanupDriver(id).catch((err) => {
          logger.debug(`Exit hook: error stopping driver ${id}: {error}`, {
            error: err,
          });
        });
      }),
    );
  };

  static clear() {
    this.#drivers = {};
  }
}
