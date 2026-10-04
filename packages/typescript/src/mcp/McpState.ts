/**
 * @module MCP State
 * State management for MCP server driver instances.
 */

import type { BaseServerAccessibilityTree } from "../server/accessibility/BaseServerAccessibilityTree.ts";

import { Alumni } from "../client/Alumni.ts";
import { PlaywrightDriver } from "../drivers/PlaywrightDriver.ts";
import { LlmUsageStats } from "../llm/llmSchema.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { McpArtifactsStore } from "./McpArtifactsStore.ts";
import type { McpDriver } from "./mcpDrivers.ts";
import { McpDriverCleanupError } from "./McpDriverCleanupError.ts";

const { logger, tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export namespace McpState {
  export type DriverPair = [Alumni, McpDriver];

  export interface Driver {
    readonly al: Alumni;
    tree?: BaseServerAccessibilityTree | undefined;
    readonly mcpDriver: McpDriver;
    readonly artifactsStore: McpArtifactsStore;
    stepCounter: number;
  }
}

export abstract class McpState {
  static #drivers: Record<string, McpState.Driver> = {}; // id -> driver state
  static #nextDriverId = 1;
  static #starting = 0;
  static #cleanupFailed = false;
  static #stopping: Record<string, Promise<[string, LlmUsageStats]>> = {};

  /** Reserve before awaiting initialization; stopping drivers still occupy a slot. */
  static async startDriver<T>(
    limit: number | undefined,
    start: () => Promise<T>,
  ): Promise<T> {
    if (this.#cleanupFailed)
      throw new Error(
        "Driver cleanup failed. Restart this server before starting another session.",
      );
    if (
      limit !== undefined &&
      Object.keys(this.#drivers).length + this.#starting >= limit
    )
      throw new Error(
        `This server allows at most ${limit} active browser session(s). Stop the current session first.`,
      );
    this.#starting++;
    try {
      return await start();
    } catch (error) {
      if (error instanceof McpDriverCleanupError) this.#cleanupFailed = true;
      throw error;
    } finally {
      this.#starting--;
    }
  }

  static markCleanupFailed(): void {
    this.#cleanupFailed = true;
  }

  static #cleanupHooksRegistered = false;
  static #cleanupAllPromise: Promise<void> | null = null;

  /**
   * Generate a unique driver ID from the given base by appending an
   * incrementing `-N` suffix. Advance the counter before driver initialization
   * so concurrent starts cannot receive the same ID before registration.
   */
  static generateDriverId(base: string): string {
    let id = `${base}-${this.#nextDriverId++}`;
    while (this.#drivers[id]) {
      id = `${base}-${this.#nextDriverId++}`;
    }
    return id;
  }

  static registerDriver(
    id: string,
    al: Alumni,
    mcpDriver: McpDriver,
    artifactsStore: McpArtifactsStore,
  ): void {
    this.#registerCleanupHooks();

    this.#drivers[id] = {
      al,
      mcpDriver,
      artifactsStore: artifactsStore,
      stepCounter: 1,
    };

    logger.debug(`Registered driver ${id}`);
  }

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

  static getDriverState(id: string): McpState.Driver {
    const driverState = this.#drivers[id];
    if (!driverState) {
      logger.error(`Driver state for ${id} not found`);
      // NOTE: This error is required for the controlling agent calling MCP.
      throw new Error(`Driver ${id} not found. Call start first.`);
    }
    return driverState;
  }

  @span("mcp.driver.shutdown", (id) => ({ "mcp.driver.id": id }))
  static async cleanupDriver(id: string): Promise<[string, LlmUsageStats]> {
    if (this.#stopping[id]) return this.#stopping[id];
    const stopping = this.#cleanupDriver(id);
    this.#stopping[id] = stopping;
    try {
      return await stopping;
    } finally {
      delete this.#stopping[id];
    }
  }

  static async #cleanupDriver(id: string): Promise<[string, LlmUsageStats]> {
    const driverState = this.getDriverState(id);

    logger.debug(`Cleaning up driver ${id}`);

    const { al } = driverState;
    let stats: LlmUsageStats;
    try {
      stats = await al.getStats();

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
    } finally {
      try {
        await al.quit();
      } finally {
        // MCP owns the browser, including any other tabs opened by this session.
        if (al.driver instanceof PlaywrightDriver)
          await al.driver.page.context().browser()?.close();
      }

      delete this.#drivers[id];
      tracer.end(id);
    }
    logger.debug(`Driver ${id} cleanup complete`);

    return [driverState.artifactsStore.dir, stats];
  }

  static async cleanupAllDrivers(): Promise<void> {
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
  }

  static clear() {
    this.#drivers = {};
    this.#nextDriverId = 1;
    this.#starting = 0;
    this.#cleanupFailed = false;
    this.#stopping = {};
    this.#cleanupAllPromise = null;
  }

  static #registerCleanupHooks(): void {
    if (this.#cleanupHooksRegistered) return;

    process.once("beforeExit", () => void this.#cleanupAllDriversOnce());
    process.once(
      "SIGINT",
      () => void this.#cleanupAllDriversOnce().finally(() => process.exit(0)),
    );
    process.once(
      "SIGTERM",
      () => void this.#cleanupAllDriversOnce().finally(() => process.exit(0)),
    );

    logger.debug("Registered MCP cleanup hooks");
    this.#cleanupHooksRegistered = true;
  }

  static #cleanupAllDriversOnce(): Promise<void> {
    if (!this.#cleanupAllPromise) {
      this.#cleanupAllPromise = this.cleanupAllDrivers().finally(() => {
        this.#cleanupAllPromise = null;
      });
    }

    return this.#cleanupAllPromise;
  }
}
