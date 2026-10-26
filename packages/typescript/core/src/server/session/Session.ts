import type { LanguageModelV4 } from "@ai-sdk/provider";
import z from "zod";
import { AppId } from "../../AppId.ts";
import { Driver } from "../../drivers/Driver.ts";
import type { LanguageModel } from "../../llm/LanguageModel.ts";
import {
  createLlmUsage,
  LlmUsage,
  LlmUsageStats,
} from "../../llm/llmSchema.ts";
import { loadAi } from "../../llm/loadAi.ts";
import { Model } from "../../Model.ts";
import { Logger } from "../../telemetry/Logger.ts";
import type { ToolDefinition } from "../../tools/ToolDefinition.ts";
import { TreeFactory } from "../../tree/TreeFactory.ts";
import { BaseServerAccessibilityTree } from "../accessibility/BaseServerAccessibilityTree.ts";
import { ActorAgent } from "../agents/ActorAgent.ts";
import { AreaAgent } from "../agents/AreaAgent.ts";
import { ChangesAnalyzerAgent } from "../agents/ChangesAnalyzerAgent.ts";
import { LocatorAgent } from "../agents/LocatorAgent.ts";
import { PlannerAgent } from "../agents/PlannerAgent.ts";
import { RetrieverAgent } from "../agents/RetrieverAgent.ts";
import { createCacheMiddleware } from "../cache/CacheMiddleware.ts";
import { ServerCache } from "../cache/ServerCache.ts";
import { CacheFactory } from "../CacheFactory.ts";
import { SessionContext } from "./SessionContext.ts";
import { SessionId } from "./SessionId.ts";

const logger = Logger.get(import.meta.url);

export namespace Session {
  export interface Props {
    app?: AppId | undefined;
    sessionId: SessionId;
    model: Model;
    platform: Driver.Platform;
    // Optional since Java/Python only support Appium.
    driver?: Driver.Kind | undefined;
    tools: ToolDefinition[];
    planner?: boolean | undefined;
    excludeAttributes?: Set<string> | undefined;
  }
}

/**
 * Represents a client session with its own agent instances.
 */
export class Session {
  static Id = z.custom<SessionId>((val) => typeof val === "string", {
    message: "Invalid session ID",
  });

  static defaultDriver(platform: Driver.Platform): Driver.Kind {
    return platform === "chromium" || platform === "firefox"
      ? "selenium"
      : "appium";
  }

  sessionId: SessionId;
  model: Model;
  platform: Driver.Platform;
  driver: Driver.Kind;
  tools: ToolDefinition[];
  #llm: LanguageModel | undefined;
  cache: ServerCache;
  planner: boolean;
  excludeAttributes: Set<string>;
  #context: SessionContext;

  #actorAgent: ActorAgent | undefined;
  #plannerAgent: PlannerAgent | undefined;
  #retrieverAgent: RetrieverAgent | undefined;
  #areaAgent: AreaAgent | undefined;
  #locatorAgent: LocatorAgent | undefined;
  #changesAnalyzerAgent: ChangesAnalyzerAgent | undefined;

  constructor(props: Session.Props) {
    const { sessionId, model, platform, app, tools } = props;
    this.sessionId = sessionId;
    this.model = model;
    this.platform = platform;
    this.driver = props.driver ?? Session.defaultDriver(platform);
    this.tools = tools;
    this.planner = props.planner ?? true;
    this.excludeAttributes = props.excludeAttributes ?? new Set();
    this.#context = new SessionContext({ app, sessionId });
    this.cache = CacheFactory.createCache(this.#context, model);

    logger.info(
      `Created session ${sessionId} with model ${model.provider}/${model.name} and platform ${platform}`,
    );
  }

  get llm(): LanguageModel {
    return (this.#llm ??= wrapLanguageModelLazily({
      model: this.#createLlm(),
      middleware: createCacheMiddleware(this.cache),
    }));
  }

  #createLlm(): LanguageModel {
    if (!Model.hasProvider(this.model))
      throw Model.missingProviderError(this.model);
    return this.model.createLlm();
  }

  get actorAgent(): ActorAgent {
    return (this.#actorAgent ??= new ActorAgent(
      this.model,
      this.llm,
      this.tools,
    ));
  }

  get plannerAgent(): PlannerAgent {
    return (this.#plannerAgent ??= new PlannerAgent(
      this.model,
      this.llm,
      this.tools.map((schema) => schema.function.name),
    ));
  }

  get retrieverAgent(): RetrieverAgent {
    return (this.#retrieverAgent ??= new RetrieverAgent(this.model, this.llm));
  }

  get areaAgent(): AreaAgent {
    return (this.#areaAgent ??= new AreaAgent(this.model, this.llm));
  }

  get locatorAgent(): LocatorAgent {
    return (this.#locatorAgent ??= new LocatorAgent(this.model, this.llm));
  }

  get changesAnalyzerAgent(): ChangesAnalyzerAgent {
    return (this.#changesAnalyzerAgent ??= new ChangesAnalyzerAgent(
      this.model,
      this.llm,
    ));
  }

  updateContext(props: SessionContext.UpdateProps): void {
    this.#context.update(props);
  }

  get app(): AppId {
    return this.#context.app;
  }

  set app(appId: AppId) {
    this.updateContext({ app: appId });
  }

  /**
   * Provides statistics about the usage of tokens.
   *
   * @returns Session usage statistics.
   */
  get stats(): LlmUsageStats {
    const usageStats: LlmUsageStats = {
      total: createLlmUsage(),
      cache: this.cache.usage,
    };

    const agents = [
      this.#plannerAgent,
      this.#actorAgent,
      this.#retrieverAgent,
      this.#areaAgent,
      this.#locatorAgent,
      this.#changesAnalyzerAgent,
    ];

    agents.forEach((agent) => {
      if (!agent) return;

      (Object.keys(usageStats.total) as (keyof LlmUsage)[]).forEach((key) => {
        usageStats.total[key] += agent.usage[key];
      });
    });

    return usageStats;
  }

  /**
   * Processes accessibility tree XML into a server tree.
   *
   * @param xml Accessibility tree XML
   * @returns The created server tree instance
   */
  parseTree(xml: string): BaseServerAccessibilityTree {
    const tree = TreeFactory.create(this.platform, this.driver, xml);
    logger.debug(`Processed tree for session ${this.sessionId}`);
    return tree;
  }

  static createId(): SessionId {
    return crypto.randomUUID() as SessionId;
  }
}

/**
 * Wraps a model with middleware once `ai` is loaded on the first call, so
 * sessions are created synchronously without loading `ai` upfront.
 */
function wrapLanguageModelLazily(props: {
  model: LanguageModel;
  middleware: ReturnType<typeof createCacheMiddleware>;
}): LanguageModelV4 {
  const { model, middleware } = props;
  let wrapped: Promise<LanguageModelV4> | undefined;
  const getWrapped = () =>
    (wrapped ??= loadAi().then(({ wrapLanguageModel }) =>
      wrapLanguageModel({ model, middleware }),
    ));

  return {
    specificationVersion: "v4",
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    doGenerate: async (options) => (await getWrapped()).doGenerate(options),
    doStream: async (options) => (await getWrapped()).doStream(options),
  };
}
