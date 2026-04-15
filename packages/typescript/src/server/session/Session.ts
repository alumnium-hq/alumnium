import type { ToolDefinition } from "@langchain/core/language_models/base";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import z from "zod";
import { AppId } from "../../AppId.ts";
import { Driver } from "../../drivers/Driver.ts";
import {
  createLlmUsage,
  LlmUsage,
  LlmUsageStats,
} from "../../llm/llmSchema.ts";
import { Model } from "../../Model.ts";
import { Logger } from "../../telemetry/Logger.ts";
import { BaseServerAccessibilityTree } from "../accessibility/BaseServerAccessibilityTree.ts";
import { ServerChromiumAccessibilityTree } from "../accessibility/ServerChromiumAccessibilityTree.ts";
import { ServerUIAutomator2AccessibilityTree } from "../accessibility/ServerUIAutomator2AccessibilityTree.ts";
import { ServerXCUITestAccessibilityTree } from "../accessibility/ServerXCUITestAccessibilityTree.ts";
import { ActorAgent } from "../agents/ActorAgent.ts";
import { AreaAgent } from "../agents/AreaAgent.ts";
import { ChangesAnalyzerAgent } from "../agents/ChangesAnalyzerAgent.ts";
import { LocatorAgent } from "../agents/LocatorAgent.ts";
import { PlannerAgent } from "../agents/PlannerAgent.ts";
import { RetrieverAgent } from "../agents/RetrieverAgent.ts";
import { ServerCache } from "../cache/ServerCache.ts";
import { CacheFactory } from "../CacheFactory.ts";
import { LlmContext } from "../LlmContext.ts";
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
    llm?: BaseChatModel | undefined;
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
  llm: BaseChatModel;
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
    const llmContext = new LlmContext(model);

    this.cache = CacheFactory.createCache(this.#context, llmContext, model);

    // TODO: When assigning cache via `props.llm.cache` it doesn't work properly
    // find a way to make it work or expose option to create cache via `Alumni`.
    if (props.llm) {
      props.llm.cache = this.cache;
    }
    this.llm = props.llm ?? LlmFactory.createLlm(this.model, this.cache);

    this.actorAgent = new ActorAgent(llmContext, this.llm, this.tools);
    this.plannerAgent = new PlannerAgent(
      llmContext,
      this.llm,
      this.tools.map((schema) => schema.function.name),
    );

    this.retrieverAgent = new RetrieverAgent(llmContext, this.llm);
    this.areaAgent = new AreaAgent(llmContext, this.llm);
    this.locatorAgent = new LocatorAgent(llmContext, this.llm);
    this.changesAnalyzerAgent = new ChangesAnalyzerAgent(llmContext, this.llm);

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
   * Process raw platform data into a server tree.
   *
   * @param rawTreeData Raw tree data as string (XML for all platforms)
   * @returns The created server tree instance
   */
  processTree(rawTreeData: string): BaseServerAccessibilityTree {
    let tree: BaseServerAccessibilityTree;
    if (this.platform === "chromium") {
      tree = new ServerChromiumAccessibilityTree(rawTreeData);
    } else if (this.platform === "xcuitest") {
      tree = new ServerXCUITestAccessibilityTree(rawTreeData);
    } else if (this.platform === "uiautomator2") {
      tree = new ServerUIAutomator2AccessibilityTree(rawTreeData);
    } else {
      throw new Error(`Unknown platform: ${this.platform}`);
    }

    logger.debug(`Processed tree for session ${this.sessionId}`);
    return tree;
  }

  static createId(): SessionId {
    return crypto.randomUUID() as SessionId;
  }
}
