import {
  context,
  SpanStatusCode,
  trace,
  type Attributes,
  type AttributeValue,
  type Span as OtelSpan,
  type SpanStatus as OtelSpanStatus,
  type Tracer as OtelTracer,
} from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor } from "@opentelemetry/sdk-trace-base";
import { NodeTracerProvider } from "@opentelemetry/sdk-trace-node";
import { nanoid } from "nanoid";
import type { Driver } from "../drivers/Driver.ts";
import type { McpScenario } from "../mcp/scenarios/McpScenario.ts";
import type { Model } from "../Model.ts";
import type { Agent } from "../server/agents/Agent.ts";
import type { ElementsCache } from "../server/cache/ElementsCache/ElementsCache.ts";
import type { SessionId } from "../server/session/SessionId.ts";
import { TypeUtils } from "../typeUtils.ts";
import { Telemetry } from "./Telemetry.ts";

const TRACE = process.env.ALUMNIUM_TRACE?.toLowerCase();

export namespace Tracer {
  //#region Definitions

  //#region Spans

  export type Spans = SpansAlumni &
    SpansClient &
    SpansDriver &
    SpansSession &
    SpansAgent &
    SpansCache &
    SpansServer &
    SpansMcp &
    SpansHttp &
    SpansLlm;

  //#region Alumni

  export interface SpansAlumni {
    "alumni.model": {
      Attrs: SpansAlumniAttrsBase;
    };

    "alumni.do": {
      Attrs: SpansAlumniAttrsBase;
    };

    "alumni.check": {
      Attrs: SpansAlumniAttrsBase & SpansAlumniAttrsMethodOptionsVision;
    };

    "alumni.get": {
      Attrs: SpansAlumniAttrsBase & SpansAlumniAttrsMethodOptionsVision;
    };

    "alumni.find": {
      Attrs: SpansAlumniAttrsBase;
    };

    "alumni.area": {
      Attrs: SpansAlumniAttrsBase;
    };

    "alumni.learn": {
      Attrs: SpansAlumniAttrsBase;
    };

    "alumni.clear_learn_examples": {
      Attrs: SpansAlumniAttrsBase;
    };

    "alumni.get_stats": {
      Attrs: SpansAlumniAttrsBase;
    };

    "alumni.quit": {
      Attrs: SpansAlumniAttrsBase;
    };
  }

  export interface SpansAlumniAttrsBase {
    "alumni.flavor": "alumni" | "area";
  }

  export interface SpansAlumniAttrsMethodOptionsVision {
    "alumni.method.args.vision": boolean;
  }

  //#endregion

  //#region Client

  export interface SpansClient {
    "client.get_model": {
      Attrs: SpansClientAttrsBase;
    };

    "client.get_health": {
      Attrs: SpansClientAttrsBase;
    };

    "client.quit": {
      Attrs: SpansClientAttrsBase;
    };

    "client.plan_actions": {
      Attrs: SpansClientAttrsBase;
    };

    "client.add_example": {
      Attrs: SpansClientAttrsBase;
    };

    "client.clear_examples": {
      Attrs: SpansClientAttrsBase;
    };

    "client.execute_action": {
      Attrs: SpansClientAttrsBase;
    };

    "client.retrieve": {
      Attrs: SpansClientAttrsBase & {
        "client.retrieve.args.has_screenshot": boolean;
      };
    };

    "client.find_area": {
      Attrs: SpansClientAttrsBase;
    };

    "client.find_element": {
      Attrs: SpansClientAttrsBase;
    };

    "client.analyze_changes": {
      Attrs: SpansClientAttrsBase;
    };

    "client.save_cache": {
      Attrs: SpansClientAttrsBase;
    };

    "client.discard_cache": {
      Attrs: SpansClientAttrsBase;
    };

    "client.get_stats": {
      Attrs: SpansClientAttrsBase;
    };
  }

  export interface SpansClientAttrsBase {
    "client.kind": "native" | "http";
  }

  //#endregion

  //#region Driver

  export interface SpansDriver {
    "driver.get_accessibility_tree": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.click": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.drag_slider": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.drag_and_drop": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.hover": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.press_key": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.back": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.visit": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.scroll_to": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.quit": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.screenshot": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.title": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.type": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.upload": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.url": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.app": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.find_element": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.execute_script": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.switch_to_next_tab": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.switch_to_previous_tab": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.wait": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.wait_for_selector": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.wait_for_page_to_load": {
      Attrs: SpansDriverAttrsBase;
    };

    "driver.print_to_pdf": {
      Attrs: SpansDriverAttrsBase;
    };
  }

  export interface SpansDriverAttrsBase {
    "driver.kind": "appium" | "selenium" | "playwright";
    "driver.platform": Driver.Platform;
  }

  //#endregion

  //#region Session

  export interface SpansSession {
    "session.active": {
      Attrs: SpansSessionAttrsBase;
    };

    "session.create": {
      Attrs: SpansSessionAttrsBase;
    };

    "session.delete": {
      Attrs: SpansSessionAttrsBase;
    };
  }

  export interface SpansSessionAttrsBase {
    "session.id": SessionId;
  }

  //#endregion

  //#region Agent

  export interface SpansAgent {
    "agent.invoke": {
      Attrs: SpansAgentAttrsBase & {
        "agent.invoke.args.has_screenshot"?: boolean;
      };
    };
  }

  export interface SpansAgentAttrsBase {
    "agent.kind": Agent.Kind;
  }

  //#endregion

  //#region Cache

  export interface SpansCache {
    "cache.lookup": {
      Attrs: SpansCacheAttrsBase;
      Events: {
        "cache.lookup.hit": SpansCacheEventAttrsBase & {
          "agent.kind": Agent.Kind;

          "cache.lookup.hit.source":
            | "memory"
            | "store"
            | ElementsCache.CacheSource;
        };

        "cache.lookup.miss": SpansCacheEventAttrsBase & {
          "agent.kind"?: Agent.Kind;

          "cache.lookup.miss.reason":
            | "no_meta"
            | "not_eligible"
            | "error"
            | "not_found"
            | "resolution_failed"
            | "unimplemented"
            | "no_match";
        };
      };
    };

    "cache.update": {
      Attrs: SpansCacheAttrsBase;
      Events: {
        "cache.update.skip": SpansCacheEventAttrsBase & {
          "agent.kind"?: Agent.Kind;

          "cache.update.skip.reason":
            | "no_meta"
            | "not_eligible"
            | "unimplemented";
        };
      };
    };

    "cache.save": { Attrs: SpansCacheAttrsBase };

    "cache.discard": { Attrs: SpansCacheAttrsBase };

    "cache.clear": { Attrs: SpansCacheAttrsBase };
  }

  export interface SpansCacheAttrsBase {
    "app.id": string;
    "cache.layer": "null" | "response" | "elements" | "chained";
  }

  export interface SpansCacheEventAttrsBase extends SpansCacheAttrsBase {
    "cache.hash"?: string;
  }

  //#endregion

  //#region Server

  export interface SpansServer {
    "server.request": {
      Attrs: SpansHttpAttrs;
    };
  }

  //#endregion

  //#region MCP

  export interface SpansMcp extends SpansMcpScenario {
    "mcp.tool.invoke": {
      Attrs: SpansMcpToolAttrsBase;
    };

    "mcp.driver.active": {
      Attrs: SpansMcpToolAttrsDriverBase;
    };

    "mcp.driver.start": {
      Attrs: SpansMcpToolAttrsDriverBase & {
        "mcp.driver.kind": "appium" | "selenium" | "playwright";
        "mcp.driver.platform": string;
      };
    };

    "mcp.driver.shutdown": {
      Attrs: SpansMcpToolAttrsDriverBase;
    };
  }

  export interface SpansMcpScenario {
    "mcp.scenario.list": null;

    "mcp.scenario.lookup": null;

    "mcp.scenario.get": {
      Attrs: SpansMcpScenarioAttrsWithId;
    };

    "mcp.scenario.remove": {
      Attrs: SpansMcpScenarioAttrsWithId;
    };

    "mcp.scenario.play": {
      Attrs: SpansMcpScenarioAttrsWithId & {
        "mcp.scenario.playback.step_by_step": boolean;
      };
    };

    "mcp.scenario.playback": {
      Attrs: SpansMcpScenarioAttrsWithId & {
        "mcp.scenario.playback.step_by_step": boolean;
      };
    };

    "mcp.scenario.step": {
      Attrs: SpansMcpScenarioAttrsWithId;
    };

    "mcp.scenario.diverge": {
      Attrs: SpansMcpScenarioAttrsWithId;
    };

    "mcp.scenario.diverge_recording": {
      Attrs: SpansMcpScenarioAttrsWithId & {
        "mcp.scenario.playback.id": McpScenario.PlaybackId;
        "mcp.scenario.recording.id": McpScenario.RecordingId;
        "mcp.scenario.diverge.step_id": McpScenario.StepId | null;
      };
    };

    "mcp.scenario.reset": {
      Attrs: SpansMcpScenarioAttrsWithId;
    };

    "mcp.scenario.play_all": {
      Attrs: SpansMcpScenarioAttrsWithId & {
        "mcp.scenario.playback.id": McpScenario.PlaybackId;
      };
    };

    "mcp.scenario.play_step": {
      Attrs: SpansMcpScenarioAttrsWithId & {
        "mcp.scenario.playback.id": McpScenario.PlaybackId;
        "mcp.scenario.playback.step_id": McpScenario.StepId;
        "mcp.scenario.playback.step_by_step": boolean;
      };
    };

    "mcp.scenario.on_tool_executed": {
      Attrs: {
        "mcp.tool.name": string;
      };
    };

    "mcp.scenario.start_recording": null;

    "mcp.scenario.recording": {
      Attrs: {
        "mcp.scenario.id": McpScenario.ScenarioId | undefined;
        "mcp.scenario.recording.id": McpScenario.RecordingId;
      };
    };

    "mcp.scenario.pause_recording": {
      Attrs: SpansMcpScenarioAttrsWithId;
    };

    "mcp.scenario.unpause_recording": {
      Attrs: SpansMcpScenarioAttrsWithId;
    };

    "mcp.scenario.commit": {
      Attrs: SpansMcpScenarioAttrsWithId;
    };
  }

  export interface SpansMcpToolAttrsDriverBase {
    "mcp.driver.id": string;
  }

  export type SpansMcpScenarioName = keyof SpansMcpScenario;

  export interface SpansMcpAttrsBase {
    "mcp.driver.id"?: string;
  }

  export interface SpansMcpToolAttrsBase extends SpansMcpAttrsBase {
    "mcp.tool.name": string;
  }

  export interface SpansMcpScenarioAttrsWithId {
    "mcp.scenario.id": McpScenario.ScenarioId;
  }

  //#endregion

  //#region HTTP

  export interface SpansHttp {
    "http.request": {
      Attrs: SpansHttpAttrs;
    };
  }

  export interface SpansHttpAttrs {
    "http.request.method": string;
    "http.request.content_type"?: string;
  }

  //#endregion

  //#region LLM

  export interface SpansLlm {
    "llm.request": {
      Attrs: SpansModelAttrs;
    };
  }

  export interface SpansModelAttrs {
    "llm.model.name": string;
    "llm.model.provider": Model.Provider;
  }

  //#endregion

  //#endregion

  //#region Events

  export interface GlobalEvents {
    "todo.1": {
      "todo.1.attr": string;
    };

    "todo.2": null;
  }

  //#endregion

  //#endregion

  export type StatusCode = typeof Tracer.StatusCode;

  export interface Like {
    span<SpanName extends keyof Spans, Type>(
      spanName: SpanName,
      ...attrs: SpanFnArgsWithBody<SpanName, Promise<Type>>
    ): Promise<Type>;

    span<SpanName extends keyof Spans, Type>(
      spanName: SpanName,
      ...attrs: SpanFnArgsWithBody<SpanName, Type>
    ): Type;

    span<SpanName extends keyof Spans>(
      spanName: SpanName,
      ...attrs: SpanFnArgsWithKey<SpanName>
    ): Span<SpanName>;

    end(key: string, status?: Status): void;

    event<Name extends GlobalEventName>(
      name: Name,
      ...args: GlobalEventFnArgs<Name>
    ): void;
  }

  //#region Spans

  export type SpanName = keyof Spans;

  export type SpanFnArgsWithKey<Name extends SpanName> = Spans[Name] extends {
    Attrs: infer Attrs extends object;
  }
    ? [attrs: Attrs, key: string]
    : [key: string];

  export type SpanFnArgsWithBody<
    Name extends SpanName,
    Result,
  > = Spans[Name] extends {
    Attrs: infer Attrs extends object;
  }
    ? [attrs: Attrs, bodyFn: SpanBodyFn<Name, Result>]
    : [bodyFn: SpanBodyFn<Name, Result>];

  export type SpanFnAllArgs =
    | readonly []
    | readonly [attrs: Attrs]
    | readonly [key: string]
    | readonly [attrs: Attrs, key: string]
    | readonly [bodyFn: SpanBodyFn<any, any>]
    | readonly [attrs: Attrs, bodyFn: SpanBodyFn<any, any>];

  export type SpanFnAllArgsNormalized =
    | readonly [attrs: Attrs, bodyFn: SpanBodyFn<any, any>]
    | readonly [attrs: Attrs, key: string];

  export type SpanBodyFn<Name extends SpanName, Result> = (
    spanHelpers: SpanHelpers<Name>,
  ) => Result;

  export interface SpanHelpers<Name extends SpanName> {
    attr<
      Attrs extends Spans[Name] extends { Attrs: infer Attrs } ? Attrs : never,
      Attr extends keyof Attrs,
    >(
      key: Attr,
      value: Attrs[Attr],
    ): void;

    event: <
      Events extends Spans[Name] extends { Events: object }
        ? Spans[Name]["Events"]
        : never,
      EventName extends keyof Events,
    >(
      name: EventName,
      ...args: SpanEventFnArgs<Events, EventName>
    ) => void;
  }

  export type SpanEventFnArgs<
    Events,
    EventName extends keyof Events,
  > = Events[EventName] extends null ? [] : [attrs: Events[EventName]];

  export interface Span<Name extends SpanName> extends SpanHelpers<Name> {
    fail(error?: unknown): void;

    succeed(message?: string): void;

    end(status?: Status): void;
  }

  //#endregion

  //#region Events

  export type GlobalEventName = keyof GlobalEvents;

  export type GlobalEventFnArgs<Name extends GlobalEventName> =
    GlobalEvents[Name] extends null ? [] : [attrs: GlobalEvents[Name]];

  //#endregion

  export type Status = StatusSuccess | StatusFailure;

  export interface StatusSuccess {
    status: "success";
    message?: string;
  }

  export interface StatusFailure {
    status: "failure";
    error: string;
  }

  export type Attr = keyof AttrsMap;

  export interface AttrsMap {
    // Global
    "app.id": string;
    // Alumni attrs
    "alumni.method.args.vision": boolean;
    // Agent attrs
    "agent.name": string;
    "agent.args.has_screenshot": boolean;
    // Cache
    "cache.hash": string;
    "cache.layer": "null" | "response";
    "cache.hit.source": "memory" | "store";
    "cache.miss.reason": "no_meta" | "error" | "not_found" | "unimplemented";
    // Low-level
    "http.request.method": string;
  }

  export type Attrs = Partial<AttrsMap>;

  export type AttrValue = AttributeValue | undefined | null;
}

export abstract class Tracer {
  //#region Constants

  static readonly StatusCode = SpanStatusCode;

  //#endregion

  //#region API

  static readonly serviceName = "alumnium";

  static get enabled() {
    return !!TRACE && !["0", "false", "no", "off"].includes(TRACE);
  }

  static get(moduleUrl: string): Tracer.Like {
    const moduleName = Telemetry.moduleUrlToName(moduleUrl);

    function traceAttrs(attrs: Tracer.Attrs) {
      const compactedAttrs = Tracer.#compactAttrs(attrs);
      return { attributes: compactedAttrs };
    }

    return {
      span: (spanName: string, ...args: Tracer.SpanFnAllArgs) => {
        const [attrs, bodyFnOrKey] = this.#normalizeSpanArgs(args);

        const provider = this.#configure();

        if (typeof bodyFnOrKey === "string" || !bodyFnOrKey) {
          const key = bodyFnOrKey || nanoid();

          if (!provider) {
            const span = this.#dummySpan;
            this.#spans.set(key, span);
            return span;
          }

          const otelSpan = this.#tracer(provider).startSpan(
            spanName,
            traceAttrs(attrs),
          );

          return this.#span(otelSpan, key);
        }

        const bodyFn = bodyFnOrKey;
        if (!provider) return bodyFn(this.#dummySpanHelpers);

        return this.#tracer(provider).startActiveSpan(
          spanName,
          traceAttrs(attrs),
          (otelSpan) => {
            const span = this.#span(otelSpan);

            try {
              const result = bodyFn({
                attr: (key, value) => span.attr(key, value),

                event: (name, ...args) => span.event(name, ...args),
              });

              if (result instanceof Promise)
                return result
                  .then((res) => {
                    span.succeed();
                    return res;
                  })
                  .catch((error) => {
                    span.fail(error);
                    throw error;
                  });

              span.succeed();
              return result;
            } catch (error) {
              span.fail(error);
              throw error;
            }
          },
        );
      },

      end: (key, status) => {
        const span = this.#spans.get(key);
        if (span) {
          span.end(status);
          this.#spans.delete(key);
        }
      },

      event: (eventName, ...args) => {
        const provider = this.#configure();
        if (!provider) return;

        const attrs = args[0] || {};
        const fullEventName = `${moduleName}.${eventName}`;
        const eventAttrs = Tracer.#compactAttrs(attrs);

        const activeSpan = trace.getSpan(context.active());
        if (activeSpan) {
          activeSpan.addEvent(fullEventName, eventAttrs);
          return;
        }

        const span = this.#tracer(provider).startSpan(fullEventName, {
          attributes: eventAttrs,
        });
        span.addEvent(fullEventName, eventAttrs);
        span.end();
      },
    };
  }

  static #tracer(provider: NodeTracerProvider): OtelTracer {
    return provider.getTracer(this.serviceName);
  }

  static #compactAttrs(attrs: Tracer.Attrs): Attributes {
    return Object.fromEntries(
      Object.entries(attrs).filter(([, value]) => value != null),
    ) as Attributes;
  }

  static #normalizeSpanArgs(
    args: Tracer.SpanFnAllArgs,
  ): Tracer.SpanFnAllArgsNormalized {
    switch (args.length) {
      case 0:
        return [{}, nanoid()];

      case 1: {
        const arg = args[0];
        switch (typeof arg) {
          case "object":
            return [arg, nanoid()];

          case "string":
            return [{}, arg];

          case "function":
            return [{}, arg];
        }
      }

      case 2: {
        return args;
      }
    }
  }

  //#endregion

  //#region Store

  static #spans = new Map<string, Tracer.Span<any>>();

  static #dummySpanHelpers: Tracer.SpanHelpers<any> = {
    attr(_key: any, _value: any) {},

    event(_name: any, ..._args: any[]) {},
  };

  static #dummySpan: Tracer.Span<any> = {
    succeed(_data: unknown) {},
    fail(_error: unknown) {},
    end(_status?: Tracer.Status) {},
    ...this.#dummySpanHelpers,
  };

  static #span(
    otelSpan: OtelSpan | Promise<OtelSpan>,
    maybeKey?: string,
  ): Tracer.Span<any> {
    const startedAt = performance.now();
    const key = maybeKey || nanoid();

    const attr = (key: any, value: any) => {
      Promise.resolve(otelSpan).then((otelSpan) => {
        if (value != null) otelSpan.setAttribute(key, value);
      });
    };

    const end = (status?: Tracer.Status) => {
      this.#spans.delete(key);

      Promise.resolve(otelSpan).then((otelSpan) => {
        const endedAt = performance.now();
        const duration = endedAt - startedAt;
        attr("duration.ms", duration);

        if (status) this.#setSpanStatus(otelSpan, status);

        otelSpan.end();
      });
    };

    const event = (name: any, ...args: Tracer.SpanEventFnArgs<any, any>) => {
      const attrs = this.#compactAttrs(args[0] || {});
      Promise.resolve(otelSpan).then((otelSpan) => {
        otelSpan.addEvent(name, attrs);
      });
    };

    const span: Tracer.Span<any> = {
      attr,

      event,

      succeed: (message?: string) => {
        Promise.resolve(otelSpan).then((otelSpan) => {
          this.#setSpanStatus(otelSpan, {
            status: "success",
            message,
          });

          end();
        });
      },

      fail: (error: unknown) => {
        Promise.resolve(otelSpan).then((otelSpan) => {
          this.#setSpanStatus(otelSpan, {
            status: "failure",
            error: String(error),
          });

          otelSpan.recordException(
            error instanceof Error ? error : String(error),
          );

          end();
        });
      },

      end,
    };

    this.#spans.set(key, span);

    return span;
  }

  static #setSpanStatus(
    otelSpan: OtelSpan,
    status: TypeUtils.ToExactOptional<Tracer.Status>,
  ) {
    const otelStatus = TypeUtils.fromExactOptionalTypes<OtelSpanStatus>(
      status.status === "success"
        ? {
            code: SpanStatusCode.OK,
            message: status.message,
          }
        : {
            code: SpanStatusCode.ERROR,
            message: status.error,
          },
    );

    otelSpan.setStatus(otelStatus);
  }

  static async #flush(provider: NodeTracerProvider) {
    this.#spans.forEach((span) => {
      span.fail("Span not ended before flush");
    });

    await provider.forceFlush();
  }

  //#endregion

  //#region Configuration

  static #provider: NodeTracerProvider | undefined | null;

  static #configure(): NodeTracerProvider | null {
    if (this.#provider !== undefined) return this.#provider;

    if (this.enabled) {
      const provider = new NodeTracerProvider({
        resource: resourceFromAttributes({
          "service.name": Tracer.serviceName,
        }),
        spanProcessors: [new BatchSpanProcessor(new OTLPTraceExporter())],
      });

      provider.register();
      process.once("beforeExit", () => void this.#flush(provider));

      this.#provider = provider;
    } else {
      this.#provider = null;
    }

    return this.#provider;
  }

  //#endregion
}
