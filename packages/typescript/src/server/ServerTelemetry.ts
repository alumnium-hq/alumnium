import { Elysia } from "elysia";
import { nanoid } from "nanoid";
import { Logger } from "../telemetry/Logger.ts";
import type { Telemetry } from "../telemetry/Telemetry.ts";

export namespace ServerTelemetry {
  export type PluginBase = ReturnType<typeof pluginBase>;

  export type PluginContext =
    | PluginContextOnRequest
    | PluginContextOnAfterHandle
    | PluginContextOnError;

  export type PluginContextOnRequest = PluginContextInfer<
    PluginBase["onRequest"],
    0
  >;

  export type PluginContextOnAfterHandle = PluginContextInfer<
    PluginBase["onAfterHandle"],
    1
  >;

  export type PluginContextOnError = PluginContextInfer<
    PluginBase["onError"],
    1
  >;

  export type PluginContextInfer<
    Fn extends (...args: any) => any,
    HandlerIdx extends number,
  > = Parameters<Fn>[HandlerIdx][number] extends (ctx: infer Ctx) => any
    ? Ctx
    : never;

  export type HookKind = "in" | "out";
}

export abstract class ServerTelemetry {
  static plugin(telemetry: Telemetry.Like) {
    const { logger, tracer } = telemetry;
    const plugin = pluginBase();

    plugin
      .onRequest((ctx) => {
        ctx.store.telemetryStartedAt = performance.now();
        const requestId = (ctx.store.telemetryRequestId = nanoid());
        const contentType = ctx.request.headers.get("content-type");
        const contentLength = ctx.request.headers.get("content-length");

        tracer.span(
          "server.request",
          { "http.request.method": ctx.request.method },
          requestId,
        );

        logger.debug(`-> ${this.#fmtSignature(ctx.request)}`);
        logger.debug(`  -> content-type: ${contentType || "-"}`);
        logger.debug(`  -> content-length: ${contentLength || "-"}`);
      })
      .onAfterHandle((ctx) => {
        const { headers, status } = ctx.set;
        const requestId = ctx.store.telemetryRequestId;

        tracer.end(requestId);

        logger.info(
          `<- ${this.#fmtSignature(ctx.request)}: ${status} (${this.#fmtDuration(this.#handlerDuration(ctx))})`,
        );
        logger.debug(`  <- content-type: ${headers["content-type"] || "-"}`);
        logger.debug(
          `  <- content-length: ${headers["content-length"] || "-"} B`,
        );
        logger.debug("  <- body: {body}", {
          body: Logger.debugExtra("http", ctx.body),
        });
      })
      .onError((ctx) => {
        const { status } = ctx.set;
        const requestId = ctx.store.telemetryRequestId;
        const error = String(ctx.error);

        tracer.end(requestId, { status: "failure", error: error });

        logger.warn(`<- ${this.#fmtSignature(ctx.request)}: ${status}`);
        logger.warn(`  <- error: ${error}`);
      });

    return plugin;
  }

  static #handlerDuration(ctx: ServerTelemetry.PluginContext) {
    return performance.now() - ctx.store.telemetryStartedAt;
  }

  static #fmtSignature(request: Request) {
    const path = this.#requestPath(request) || "-";
    return `${request.method} ${path}`;
  }

  static #fmtDuration(duration: number): string {
    return `${duration.toFixed(2)} ms`;
  }

  static #requestPath(request: Request): string | undefined {
    const url = URL.parse(request.url);
    return url?.pathname;
  }
}

function pluginBase() {
  return new Elysia()
    .state("telemetryStartedAt", 0)
    .state("telemetryRequestId", "");
}
