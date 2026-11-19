/**
 * @module MCP State
 * State management for MCP server driver instances.
 */

import { Alumni } from "alumnium";
import {
  type BaseServerAccessibilityTree,
  LlmUsageStats,
  Telemetry,
} from "@alumnium/core/internal";
import { PlaywrightDriver } from "@alumnium/playwright";
import type { MobileDevice } from "./devices/MobileDevice.ts";
import type { McpArtifactsStore } from "./McpArtifactsStore.ts";
import { closeMcpDriver, type McpDriver } from "./mcpDrivers.ts";

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
    readonly device?: MobileDevice | undefined;
    cleanup?: Promise<[string, LlmUsageStats]>;
  }
}

export abstract class McpState {
  static #drivers: Record<string, McpState.Driver> = {}; // id -> driver state
  static #nextDriverId = 1;
  static #starting = new Set<Promise<unknown>>();

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
    device?: MobileDevice,
  ): void {
    this.#registerCleanupHooks();

    this.#drivers[id] = {
      al,
      mcpDriver,
      artifactsStore: artifactsStore,
      stepCounter: 1,
      device,
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

  static async startDriver<T>(start: () => Promise<T>): Promise<T> {
    if (this.#cleanupAllPromise)
      throw new Error(
        "Cannot start a driver while MCP sessions are shutting down",
      );
    this.#registerCleanupHooks();
    const starting = Promise.resolve().then(start);
    this.#starting.add(starting);
    try {
      return await starting;
    } finally {
      this.#starting.delete(starting);
    }
  }

  @span("mcp.driver.shutdown", (id) => ({ "mcp.driver.id": id }))
  static cleanupDriver(id: string): Promise<[string, LlmUsageStats]> {
    const state = this.getDriverState(id);
    state.cleanup ??= this.#cleanupDriver(id, state);
    return state.cleanup;
  }

  static async #cleanupDriver(
    id: string,
    state: McpState.Driver,
  ): Promise<[string, LlmUsageStats]> {
    const { al, artifactsStore, device, mcpDriver } = state;
    try {
      const stats = await al.getStats();
      if (al.driver instanceof PlaywrightDriver) {
        const tracePath = await artifactsStore.ensureFilePath("trace.zip");
        await al.driver.page.context().tracing.stop({ path: tracePath });
      }
      const statsPath = await artifactsStore.writeJson(
        "token-stats.json",
        stats,
      );
      logger.info(`Driver ${id}: Token stats saved to ${statsPath}`);
      return [artifactsStore.dir, stats];
    } finally {
      try {
        await closeMcpDriver(mcpDriver, al);
      } finally {
        try {
          await device?.close();
        } finally {
          delete this.#drivers[id];
          tracer.end(id);
        }
      }
    }
  }

  static cleanupAllDrivers(): Promise<void> {
    this.#cleanupAllPromise ??= this.#cleanupAllDrivers().finally(() => {
      this.#cleanupAllPromise = null;
    });
    return this.#cleanupAllPromise;
  }

  static async #cleanupAllDrivers(): Promise<void> {
    await Promise.allSettled([...this.#starting]);
    await Promise.all(
      Object.keys(this.#drivers).map(async (id) => {
        await this.cleanupDriver(id).catch((error) => {
          logger.debug(`Exit hook: error stopping driver ${id}: {error}`, {
            error,
          });
        });
      }),
    );
  }

  static clear() {
    this.#drivers = {};
    this.#nextDriverId = 1;
    this.#cleanupAllPromise = null;
    this.#starting.clear();
  }

  static #registerCleanupHooks(): void {
    if (this.#cleanupHooksRegistered) return;

    process.once("beforeExit", () => void this.cleanupAllDrivers());
    process.once(
      "SIGINT",
      () => void this.cleanupAllDrivers().finally(() => process.exit(0)),
    );
    process.once(
      "SIGTERM",
      () => void this.cleanupAllDrivers().finally(() => process.exit(0)),
    );

    logger.debug("Registered MCP cleanup hooks");
    this.#cleanupHooksRegistered = true;
  }
}
