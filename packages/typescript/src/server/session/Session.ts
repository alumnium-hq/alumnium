import { wrapLanguageModel } from "ai";
import z from "zod";
import { AppId } from "../../AppId.ts";
import { Driver } from "../../drivers/Driver.ts";
import {
  createLlmUsage,
  LlmUsage,
  LlmUsageStats,
} from "../../llm/llmSchema.ts";
import type { LanguageModel } from "../../llm/LanguageModel.ts";
import { Model } from "../../Model.ts";
import { Logger } from "../../telemetry/Logger.ts";
import type { ToolDefinition } from "../../tools/ToolDefinition.ts";
import { BaseServerAccessibilityTree } from "../accessibility/BaseServerAccessibilityTree.ts";
import { TreeFactory } from "../../tree/TreeFactory.ts";
import { ActorAgent } from "../agents/ActorAgent.ts";
import { AreaAgent } from "../agents/AreaAgent.ts";
import { ChangesAnalyzerAgent } from "../agents/ChangesAnalyzerAgent.ts";
import { LocatorAgent } from "../agents/LocatorAgent.ts";
import { PlannerAgent } from "../agents/PlannerAgent.ts";
import { RetrieverAgent } from "../agents/RetrieverAgent.ts";
import { ServerCache } from "../cache/ServerCache.ts";
import { createCacheMiddleware } from "../cache/CacheMiddleware.ts";
import { CacheFactory } from "../CacheFactory.ts";
import { LlmFactory } from "../LlmFactory.ts";
import { SessionContext } from "./SessionContext.ts";
import { SessionId } from "./SessionId.ts";

const logger = Logger.get(import.meta.url);

export namespace Session {
  export interface Props {
    app?: AppId | undefined;
    sessionId: SessionId;
    model: Model;
    platform: Driver.Platform;
    tools: ToolDefinition[];
    llm?: LanguageModel | undefined;
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

  sessionId: SessionId;
  model: Model;
  platform: Driver.Platform;
  tools: ToolDefinition[];
  llm: LanguageModel;
  cache: ServerCache;
  planner: boolean;
  excludeAttributes: Set<string>;
  #context: SessionContext;

  actorAgent: ActorAgent;
  plannerAgent: PlannerAgent;
  retrieverAgent: RetrieverAgent;
  areaAgent: AreaAgent;
  locatorAgent: LocatorAgent;
  changesAnalyzerAgent: ChangesAnalyzerAgent;

  constructor(props: Session.Props) {
    const { sessionId, model, platform, app, tools } = props;
    this.sessionId = sessionId;
    this.model = model;
    this.platform = platform;
    this.tools = tools;
    this.planner = props.planner ?? true;
    this.excludeAttributes = props.excludeAttributes ?? new Set();
    this.#context = new SessionContext({ app, sessionId });
    this.cache = CacheFactory.createCache(this.#context, model);
    const llm = props.llm ?? LlmFactory.createLlm(this.model);
    this.llm = wrapLanguageModel({
      model: llm,
      middleware: createCacheMiddleware(this.cache),
    });

    this.actorAgent = new ActorAgent(model, this.llm, this.tools);
    this.plannerAgent = new PlannerAgent(
      model,
      this.llm,
      this.tools.map((schema) => schema.function.name),
    );

    this.retrieverAgent = new RetrieverAgent(model, this.llm);
    this.areaAgent = new AreaAgent(model, this.llm);
    this.locatorAgent = new LocatorAgent(model, this.llm);
    this.changesAnalyzerAgent = new ChangesAnalyzerAgent(model, this.llm);

    logger.info(
      `Created session ${sessionId} with model ${model.provider}/${model.name} and platform ${platform}`,
    );
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
      this.plannerAgent,
      this.actorAgent,
      this.retrieverAgent,
      this.areaAgent,
      this.locatorAgent,
      this.changesAnalyzerAgent,
    ];

    agents.forEach((agent) => {
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
    const tree = TreeFactory.create(this.platform, xml);
    logger.debug(`Processed tree for session ${this.sessionId}`);
    return tree;
  }

  static createId(): SessionId {
    return crypto.randomUUID() as SessionId;
  }
}
