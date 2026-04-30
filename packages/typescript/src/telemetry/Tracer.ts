import {
  context,
  SpanStatusCode,
  trace,
  type Attributes as OtelAttributes,
  type AttributeValue as OtelAttributeValue,
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
import type { Model } from "../Model.ts";
import type { Agent } from "../server/agents/Agent.ts";
import type { ElementsCache } from "../server/cache/ElementsCache/ElementsCache.ts";
import type { SessionId } from "../server/session/SessionId.ts";
import { TypeUtils } from "../typeUtils.ts";
import { Telemetry } from "./Telemetry.ts";

const TRACE = process.env.ALUMNIUM_TRACE?.toLowerCase();

export namespace Tracer {
  //#region Defs

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

    "driver.internal.cdp_command": {
      Attrs: SpansDriverAttrsBase & {
        "driver.internal.cdp_command.name": string;
      };
    };

    "driver.internal.build_frame_hierarchy": null;

    "driver.internal.switch_to_frame_chain": null;

    "driver.internal.switch_to_single_frame": null;

    "driver.internal.wait_for_page_load": null;

    "driver.internal.switch_to_new_tab": null;

    "driver.tree.to_str": {
      Attrs: {
        "driver.tree.platform": "chromium";
      };
    };

    "driver.tree.element_by_id": {
      Attrs: {
        "driver.tree.platform": "chromium";
      };
    };

    "driver.tree.scope_to_area": {
      Attrs: {
        "driver.tree.platform": "chromium";
      };
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
      Attrs: TypeUtils.PartialKeys<SpansSessionAttrsBase, "session.id">;
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

  export interface SpansMcp {
    "mcp.tool.invoke": {
      Attrs: {
        "mcp.tool.name": string;
      };
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

  export interface SpansMcpToolAttrsDriverBase {
    "mcp.driver.id": string;
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

  //#region Types

  //#region Tracer

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

    end(key: string, status?: SpanStatus): void;

    event<Name extends GlobalEventName>(
      name: Name,
      ...args: GlobalEventFnArgs<Name>
    ): void;

    dec(): Dec;
  }

  export interface Dec {
    span<
      SpanName extends keyof Spans,
      GetterArgs extends unknown[] = any[],
      This = any,
    >(
      this: void,
      spanName: SpanName,
      ...attrs: NoInfer<SpanMethodDecArgs<This, GetterArgs, SpanName>>
    ): DecMethod<This, GetterArgs>;
  }

  export type DecMethod<This, Args extends unknown[]> = <Return>(
    value: (this: This, ...args: Args) => Return,
    context: ClassMethodDecoratorContext<
      This,
      (this: This, ...args: Args) => Return
    >,
  ) => (this: This, ...args: Args) => Return;

  //#endregion

  //#region Shared

  export type AttrValue = OtelAttributeValue | undefined | null;

  //#endregion

  //#region Spans

  export type SpanMethod =
    | (<Name extends keyof Spans, Type>(
        spanName: Name,
        ...attrs: SpanFnArgsWithBody<Name, Promise<Type>>
      ) => Promise<Type>)
    | (<Name extends keyof Spans, Type>(
        spanName: Name,
        ...attrs: SpanFnArgsWithBody<Name, Type>
      ) => Type)
    | (<SpanName extends keyof Spans>(
        spanName: SpanName,
        ...attrs: SpanFnArgsWithKey<SpanName>
      ) => Span<SpanName>);

  export type SpanName = keyof Spans;

  //#region Span Fn

  export type SpanBodyFn<Name extends SpanName, Result> = (
    span: Span<Name>,
  ) => Result;

  export type SpanFnArgsWithKey<Name extends SpanName> = Spans[Name] extends {
    Attrs: infer Attrs;
  }
    ? TypeUtils.IsNever<Attrs> extends true
      ? SpanFnArgsWithKeyNoAttrs
      : SpanFnArgsWithKeyWithAttrs<Attrs>
    : SpanFnArgsWithKeyNoAttrs;

  export type SpanFnArgsWithKeyWithAttrs<Attrs> = [attrs: Attrs, key: string];

  export type SpanFnArgsWithKeyNoAttrs = [key: string];

  export type SpanFnArgsWithBody<
    Name extends SpanName,
    Result,
  > = Spans[Name] extends { Attrs: infer Attrs }
    ? TypeUtils.IsNever<Attrs> extends true
      ? SpanFnArgsWithBodyNoAttrs<Name, Result>
      : SpanFnArgsWithBodyWithAttrs<Name, Attrs, Result>
    : SpanFnArgsWithBodyNoAttrs<Name, Result>;

  export type SpanFnArgsWithBodyWithAttrs<
    Name extends SpanName,
    Attrs,
    Result,
  > = [attrs: Attrs, bodyFn: SpanBodyFn<Name, Result>];

  export type SpanFnArgsWithBodyNoAttrs<Name extends SpanName, Result> = [
    bodyFn: SpanBodyFn<Name, Result>,
  ];

  export type SpanFnAllArgs<Name extends SpanName, Result> =
    | SpanFnArgsWithBody<Name, Result>
    | SpanFnArgsWithKey<Name>;

  export type SpanFnAllArgsAny =
    | readonly []
    | readonly [attrs: SpanFnAttrsAny]
    | readonly [key: string]
    | readonly [attrs: SpanFnAttrsAny, key: string]
    | readonly [bodyFn: SpanBodyFn<any, any>]
    | readonly [attrs: SpanFnAttrsAny, bodyFn: SpanBodyFn<any, any>];

  export type SpanFnAllArgsNormalized =
    | readonly [attrs: SpanFnAttrsAny, bodyFn: SpanBodyFn<any, any>]
    | readonly [attrs: SpanFnAttrsAny, key: string];

  export type SpanFnAttrsAny = Record<string, AttrValue>;

  //#endregion

  //#endregion

  //#region Event Fn

  export type SpanEventFnArgs<
    Events,
    EventName extends keyof Events,
  > = Events[EventName] extends null ? [] : [attrs: Events[EventName]];

  export interface Span<Name extends SpanName> {
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

    fail(error?: unknown): void;

    succeed(message?: string): void;

    end(status?: SpanStatus): void;
  }

  //#endregion

  //#region Dec

  export type SpanMethodDecArgs<
    This,
    GetterArgs extends unknown[],
    Name extends SpanName,
  > = Spans[Name] extends {
    Attrs: infer Attrs;
  }
    ? TypeUtils.IsNever<Attrs> extends true
      ? []
      : SpanMethodDecArgsWithAttrs<This, GetterArgs, Attrs>
    : [];

  export type SpanMethodDecArgsWithAttrs<
    This,
    GetterArgs extends unknown[],
    Attrs,
  > = [attrs: Attrs | ((this: This, ...args: GetterArgs) => Attrs)];

  //#endregion

  //#region Status

  export type SpanStatus = SpanStatusSuccess | SpanStatusFailure;

  export interface SpanStatusSuccess {
    status: "success";
    message?: string | undefined;
  }

  export interface SpanStatusFailure {
    status: "failure";
    error: string;
  }

  //#endregion

  //#endregion

  //#region Events

  export type GlobalEventName = keyof GlobalEvents;

  export type GlobalEventFnArgs<Name extends GlobalEventName> =
    GlobalEvents[Name] extends null ? [] : [attrs: GlobalEvents[Name]];

  //#endregion

  //#endregion
}

export abstract class Tracer {
  //#region Constants

  // static readonly StatusCode = SpanStatusCode;

  //#endregion

  //#region API

  static readonly serviceName = "alumnium";

  static get enabled() {
    return !!TRACE && !["0", "false", "no", "off"].includes(TRACE);
  }

  static get(moduleUrl: string): Tracer.Like {
    const moduleName = Telemetry.moduleUrlToName(moduleUrl);

    function traceAttrs(attrs: object) {
      const compactedAttrs = Tracer.#compactAttrs(attrs);
      return { attributes: compactedAttrs };
    }

    const spanMethod = <Name extends Tracer.SpanName, Result>(
      spanName: Name,
      ...args: Tracer.SpanFnAllArgs<Name, Result>
    ) => {
      const [attrs, bodyFnOrKey] = this.#normalizeSpanArgs(
        args as Tracer.SpanFnAllArgsAny,
      );

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
      if (!provider) return bodyFn(this.#dummySpan);

      return this.#tracer(provider).startActiveSpan(
        spanName,
        traceAttrs(attrs),
        (otelSpan) => {
          const span = this.#span(otelSpan);

          try {
            const result = bodyFn(span);

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
    };

    return {
      span: spanMethod,

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

      dec: (): Tracer.Dec => ({
        span: <This>(
          spanName: any,
          ...attrsArgs: Tracer.SpanMethodDecArgs<any, any, any>
        ) =>
          function <Result>(
            value: (this: This, ...args: any[]) => Result,
            context: ClassMethodDecoratorContext<
              This,
              (this: This, ...args: any[]) => Result
            >,
          ): (this: This, ...args: any[]) => Result {
            if (context.kind !== "method")
              throw new Error("@span can only decorate methods");

            const fn = function (this: This, ...args: any[]): Result {
              const attrsOrGetter = attrsArgs[0];

              const attrs =
                typeof attrsOrGetter === "function"
                  ? attrsOrGetter.call(this, ...args)
                  : attrsOrGetter;

              return spanMethod(spanName, attrs || {}, () =>
                value.call(this, ...args),
              );
            };

            // NOTE: Instead of directly setting the name, we define it with'
            // Object.defineProperty to avoid compatibility issues with certain
            // environments, i.e., Vitest.
            Object.defineProperty(fn, "name", { value: context.name });

            return fn;
          },
      }),
    };
  }

  static #tracer(provider: NodeTracerProvider): OtelTracer {
    return provider.getTracer(this.serviceName);
  }

  static #compactAttrs(attrs: object): OtelAttributes {
    return Object.fromEntries(
      Object.entries(attrs).filter(([, value]) => value != null),
    );
  }

  static #normalizeSpanArgs(
    args: Tracer.SpanFnAllArgsAny,
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

  static #dummySpan: Tracer.Span<any> = {
    attr(_key: any, _value: any) {},
    event(_name: any, ..._args: any[]) {},
    succeed(_data: unknown) {},
    fail(_error: unknown) {},
    end(_status?: Tracer.SpanStatus) {},
  };

  static #span(
    otelSpan: OtelSpan | Promise<OtelSpan>,
    maybeKey?: string,
  ): Tracer.Span<any> {
    const startedAt = performance.now();
    const key = maybeKey || nanoid();
    let ended = false;

    const attr = (key: any, value: any) => {
      void Promise.resolve(otelSpan).then((otelSpan) => {
        if (value != null) otelSpan.setAttribute(key, value);
      });
    };

    const end = (status?: Tracer.SpanStatus) => {
      if (ended) return;
      ended = true;

      this.#spans.delete(key);

      void Promise.resolve(otelSpan).then((otelSpan) => {
        const endedAt = performance.now();
        const duration = endedAt - startedAt;
        attr("duration.ms", duration);

        if (status) this.#setSpanStatus(otelSpan, status);

        otelSpan.end();
      });
    };

    const event = (name: any, ...args: Tracer.SpanEventFnArgs<any, any>) => {
      const attrs = this.#compactAttrs(args[0] || {});
      void Promise.resolve(otelSpan).then((otelSpan) => {
        otelSpan.addEvent(name, attrs);
      });
    };

    const span: Tracer.Span<any> = {
      attr,

      event,

      succeed: (message?: string) => {
        end({
          status: "success",
          message,
        });
      },

      fail: (error: unknown) => {
        void Promise.resolve(otelSpan).then((otelSpan) => {
          otelSpan.recordException(
            error instanceof Error ? error : String(error),
          );

          end({
            status: "failure",
            error: String(error),
          });
        });
      },

      end,
    };

    this.#spans.set(key, span);

    return span;
  }

  static #setSpanStatus(
    otelSpan: OtelSpan,
    status: TypeUtils.ToExactOptional<Tracer.SpanStatus>,
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
