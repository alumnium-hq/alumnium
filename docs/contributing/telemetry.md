# Alumnium Telemetry

The codebase is instrumented with logs, metrics, and traces to help us understand how the system is performing and to diagnose issues when they arise.

The two core components are:

- **Logger**: Self-explanatory. Powered by [LogTape](https://logtape.org/).
- **Tracer**: Used for tracking spans and events. Powered by [OpenTelemetry](https://opentelemetry.io/).

## Tracing

To enable tracing, set the `ALUMNIUM_TRACE` env var to `true` and configure and start an OpenTelemetry backend.

For Alumnium development, use the local Docker image, run:

```bash
mise //telemetry:docker/up
```

It will start the [`grafana/otel-lgtm`](https://github.com/grafana/docker-otel-lgtm) image that bundles [OpenTelemetry Collector](https://opentelemetry.io/docs/collector/), [Prometheus](https://prometheus.io/), [Tempo](https://grafana.com/oss/tempo/), [Loki](https://grafana.com/oss/loki/), [Pyroscope](https://grafana.com/oss/pyroscope/), and [Grafana](https://grafana.com/oss/grafana/).

### Custom OpenTelemetry Backend

By default, the mise sets the following OpenTelemetry env vars pointing to a local OTLP endpoint:

- `OTEL_SERVICE_NAME = "alumnium"`
- `OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:4318"`
- `OTEL_EXPORTER_OTLP_PROTOCOL = "http/protobuf"`

Use these env vars to configure a custom OpenTelemetry backend.

### Instrumentation

Similar to `Logger.get`, you use the `Tracer.get` (or `Telemetry.get` that provides both `logger` and `tracer` instances) to get the `tracer` instance for the current module. Then use one of the `tracer` methods to create spans and events.

The span and event names and their attributes are strictly typed to avoid inconsistencies and typos. To add a new span, a span attribute/event, or a global event, update [`packages/typescript/src/telemetry/Tracer.ts`](../../packages/typescript/src/telemetry/Tracer.ts).

#### Instrumenting With Spans

Use span attributes to add more context to the span. Avoid adding any dynamic values that can't be used for querying and aggregation (e.g., prompt content, file paths, etc., are bad candidates, while IDs, and performance-relevant values, such as token counts, LLM request costs, etc., are good candidates).
