import { Env } from "../Env.ts";
import { Logger } from "../telemetry/Logger.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { Tracer } from "../telemetry/Tracer.ts";

const { logger } = Telemetry.get(import.meta.url);

export abstract class SystemProcess {
  static async shutdown(exitCode: number): Promise<never> {
    const cleanupExitCode = await this.#triggerCleanup();
    process.exit(cleanupExitCode || exitCode);
  }

  //#region Cleanup

  static #cleanupInitialized = false;

  static initCleanup() {
    if (this.#cleanupInitialized) return;
    this.#cleanupInitialized = true;

    // Handle natural exit when the event loop becomes empty
    process.on("beforeExit", this.#triggerCleanup);
    // Handle interrupt (i.e., Ctrl+C)
    process.on("SIGINT", this.#onShutdownSignal);
    // Handle termination (i.e., `kill` command)
    process.on("SIGTERM", this.#onShutdownSignal);
  }

  static #cleanupHooks: Set<SystemProcess.CleanupHook> = new Set();

  static useCleanup(
    hook: SystemProcess.CleanupHook,
  ): SystemProcess.CleanupHookOff {
    this.initCleanup();

    this.#cleanupHooks.add(hook);
    return () => this.#cleanupHooks.delete(hook);
  }

  static #shuttingDown = false;

  static #onShutdownSignal = async () => {
    // When receiving a second signal, exit immediately without waiting for
    // cleanup to complete.
    if (this.#shuttingDown) {
      logger.debug("Received second shutdown signal, exiting immediately");
      process.exit(1);
    }
    this.#shuttingDown = true;

    const cleanupExitCode = await this.#triggerCleanup();
    process.exit(cleanupExitCode);
  };

  static #cleanupPromise: Promise<number> | undefined;

  static #triggerCleanup = (): Promise<number> => {
    try {
      if (this.#cleanupPromise) return this.#cleanupPromise;

      logger.debug("Running process cleanup hooks");

      const timeoutMs = Env.ALUMNIUM_SHUTDOWN_TIMEOUT_MS;

      const timeout = new Promise((resolve) =>
        setTimeout(resolve, timeoutMs).unref(),
      );

      this.#cleanupPromise = Promise.race([
        this.#triggerCleanupHooks(),

        timeout.then(() => {
          logger.warn(`Process cleanup timed out after ${timeoutMs}ms`);
        }),
      ]).then(() => 0);
      return this.#cleanupPromise;
    } catch (error) {
      logger.error("Process cleanup failed:\n\n{error}", { error });
      return Promise.resolve(1);
    }
  };

  static #triggerCleanupHooks() {
    return Promise.all(
      [
        Logger.flush(),
        Tracer.flush(),
        ...Array.from(this.#cleanupHooks).map((hook) =>
          Promise.resolve().then(hook),
        ),
      ]
        // Prevent unhandled promise rejections from cleanup hooks from crashing
        // the process.
        .map((promise) => promise.catch(this.#onCleanupHookError)),
    );
  }

  static #onCleanupHookError(this: void, error: unknown) {
    logger.error("Process cleanup hook failed:\n\n{error}", { error });
  }

  static clearCleanup() {
    this.#cleanupHooks.clear();
    this.#cleanupPromise = undefined;
    this.#shuttingDown = false;

    if (!this.#cleanupInitialized) return;

    process.off("beforeExit", this.#triggerCleanup);
    process.off("SIGINT", this.#onShutdownSignal);
    process.off("SIGTERM", this.#onShutdownSignal);
    this.#cleanupInitialized = false;
  }

  //#endregion
}

export namespace SystemProcess {
  export type CleanupHook = () => Promise<void> | void;

  export type CleanupHookOff = () => void;
}
