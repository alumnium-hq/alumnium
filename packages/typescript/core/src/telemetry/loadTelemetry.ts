import type { Sink } from "@logtape/logtape";

export namespace loadTelemetry {
  /** OpenTelemetry exporters provided by `@alumnium/telemetry`. */
  export interface Module {
    startTracing(serviceName: string): Tracing;
    getLogSink(serviceName: string): Sink;
  }

  export interface Tracing {
    flush(): Promise<void>;
  }
}

let telemetryPromise: Promise<loadTelemetry.Module | undefined> | undefined;

/**
 * Loads `@alumnium/telemetry`, which exports traces and logs when tracing is
 * enabled. It's an optional peer dependency of `@alumnium/core`, so installs
 * without tracing skip the OpenTelemetry SDK. When it's missing, a warning is
 * printed and nothing is exported, so tracing never breaks a run.
 */
export function loadTelemetry(): Promise<loadTelemetry.Module | undefined> {
  return (telemetryPromise ??= import("@alumnium/telemetry").then(
    (module): loadTelemetry.Module => module,
    () => {
      console.warn(
        'ALUMNIUM_TRACE is enabled, but traces and logs aren\'t exported without the "@alumnium/telemetry" package. Install it, e.g. `npm install @alumnium/telemetry`.',
      );
      return undefined;
    },
  ));
}
