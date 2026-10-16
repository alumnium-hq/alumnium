import type { Sink } from "@logtape/logtape";
import { getOpenTelemetrySink } from "@logtape/otel";
import { OTLPLogExporter as GrpcLogExporter } from "@opentelemetry/exporter-logs-otlp-grpc";
import { OTLPLogExporter as HttpLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPLogExporter as ProtoLogExporter } from "@opentelemetry/exporter-logs-otlp-proto";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import {
  defaultResource,
  resourceFromAttributes,
} from "@opentelemetry/resources";
import {
  LoggerProvider,
  SimpleLogRecordProcessor,
} from "@opentelemetry/sdk-logs";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";

export interface Tracing {
  /** Exports the pending spans. */
  flush(): Promise<void>;
}

/**
 * Registers the global tracer provider, exporting spans over OTLP as
 * configured by the standard `OTEL_*` environment variables.
 */
export function startTracing(serviceName: string): Tracing {
  const provider = new NodeTracerProvider({
    resource: resourceFromAttributes({ "service.name": serviceName }),
    spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
  });
  provider.register();
  return { flush: () => provider.forceFlush() };
}

/**
 * Creates a LogTape sink exporting logs over OTLP, when an OTLP endpoint is
 * configured.
 */
export function getLogSink(serviceName: string): Sink {
  // NOTE: The exporter is created here rather than by `@logtape/otel`, which
  // imports it by a dynamic specifier the Bun compiler can't bundle.
  if (!env("OTEL_EXPORTER_OTLP_LOGS_ENDPOINT", "OTEL_EXPORTER_OTLP_ENDPOINT"))
    return () => {};
  const loggerProvider = new LoggerProvider({
    resource: defaultResource().merge(
      resourceFromAttributes({ "service.name": serviceName }),
    ),
    processors: [new SimpleLogRecordProcessor(createLogExporter())],
  });
  return getOpenTelemetrySink({ loggerProvider });
}

/** Creates the log exporter for the configured OTLP protocol. */
function createLogExporter() {
  switch (
    env("OTEL_EXPORTER_OTLP_LOGS_PROTOCOL", "OTEL_EXPORTER_OTLP_PROTOCOL")
  ) {
    case "grpc":
      return new GrpcLogExporter();
    case "http/protobuf":
      return new ProtoLogExporter();
    default:
      return new HttpLogExporter();
  }
}

function env(...names: string[]): string | undefined {
  // oxlint-disable-next-line no-process-env -- Reads the standard OTEL_* vars like the OpenTelemetry SDK, as this package doesn't depend on core's Env
  return names.map((name) => process.env[name]).find(Boolean);
}
