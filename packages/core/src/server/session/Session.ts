import { ToolDefinition } from "@langchain/core/language_models/base";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import z from "zod";
import { LlmUsageStats } from "../../llm/llmSchema.js";
import { Model } from "../../Model.js";
import { getLogger } from "../../utils/logger.js";
import { BaseServerAccessibilityTree } from "../accessibility/BaseServerAccessibilityTree.js";
import { ServerChromiumAccessibilityTree } from "../accessibility/ServerChromiumAccessibilityTree.js";
import { ServerUIAutomator2AccessibilityTree } from "../accessibility/ServerUIAutomator2AccessibilityTree.js";
import { ServerXCUITestAccessibilityTree } from "../accessibility/ServerXCUITestAccessibilityTree.js";
import { ActorAgent } from "../agents/ActorAgent.js";
import { Agent } from "../agents/Agent.js";
import { AreaAgent } from "../agents/AreaAgent.js";
import { ChangesAnalyzerAgent } from "../agents/ChangesAnalyzerAgent.js";
import { LocatorAgent } from "../agents/LocatorAgent.js";
import { PlannerAgent } from "../agents/PlannerAgent.js";
import { RetrieverAgent } from "../agents/RetrieverAgent.js";
import { NullCache } from "../cache/NullCache.js";
import { CacheFactory } from "../CacheFactory.js";
import { LLMFactory } from "../LLMFactory.js";
import { Platform } from "../Platform.js";
import { UsageStats } from "../serverSchema.js";
import { SessionId } from "./SessionId.js";

const logger = getLogger(import.meta.url);

/**
 * Represents a client session with its own agent instances.
 */
export class Session {
  sessionId: SessionId;
  model: Model;
  platform: Platform;
  tools: ToolDefinition[];
  llm: BaseChatModel;
  cache: NullCache;
  planner: boolean;
  excludeAttributes: Set<string>;

  actorAgent: ActorAgent;
  plannerAgent: PlannerAgent;
  retrieverAgent: RetrieverAgent;
  areaAgent: AreaAgent;
  locatorAgent: LocatorAgent;
  changesAnalyzerAgent: ChangesAnalyzerAgent;

  constructor(props: Session.ConstructorProps) {
    const { sessionId, model, platform, tools: tools } = props;
    this.sessionId = sessionId;
    this.model = model;
    this.platform = platform;
    this.tools = tools;
    this.planner = props.planner ?? true;
    this.excludeAttributes = props.excludeAttributes ?? new Set();

    this.cache = CacheFactory.createCache();
    this.llm = props.llm ?? LLMFactory.createLlm(this.model);
    this.llm.cache = this.cache;

    this.actorAgent = new ActorAgent(this.llm, this.tools);
    this.plannerAgent = new PlannerAgent(
      this.llm,
      this.tools.map((schema) => schema.function.name),
    );
    this.retrieverAgent = new RetrieverAgent(this.llm);
    this.areaAgent = new AreaAgent(this.llm);
    this.locatorAgent = new LocatorAgent(this.llm);
    this.changesAnalyzerAgent = new ChangesAnalyzerAgent(this.llm);

    logger.info(
      `Created session ${sessionId} with model ${model.provider}/${model.name} and platform ${platform}`,
    );
  }

  /**
   * Provides statistics about the usage of tokens.
   *
   * @returns Session usage statistics.
   */
  get stats(): LlmUsageStats {
    return {
      total: {
        input_tokens:
          this.plannerAgent.toState().usage.input_tokens +
          this.actorAgent.toState().usage.input_tokens +
          this.retrieverAgent.toState().usage.input_tokens +
          this.areaAgent.toState().usage.input_tokens +
          this.locatorAgent.toState().usage.input_tokens,
        output_tokens:
          this.plannerAgent.toState().usage.output_tokens +
          this.actorAgent.toState().usage.output_tokens +
          this.retrieverAgent.toState().usage.output_tokens +
          this.areaAgent.toState().usage.output_tokens +
          this.locatorAgent.toState().usage.output_tokens,
        total_tokens:
          this.plannerAgent.toState().usage.total_tokens +
          this.actorAgent.toState().usage.total_tokens +
          this.retrieverAgent.toState().usage.total_tokens +
          this.areaAgent.toState().usage.total_tokens +
          this.locatorAgent.toState().usage.total_tokens,
      },
      cache: this.cache.usage,
    };
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

  //#region State

  toState(): Session.State {
    const state: Session.State = {
      session_id: this.sessionId,
      model: this.model.toState(),
      platform: this.platform,
      tools: this.tools,
      planner: this.planner,
      exclude_attributes: [...this.excludeAttributes],
      // "llm" is omitted even though it is passed in the constructor, as
      // 1) it's external and may not be serializable, and 2) in HTTP API
      // where sessions are exchanged, llm is never passed as a param.
      actor_agent: this.actorAgent.toState(),
      planner_agent: this.plannerAgent.toState(),
      retriever_agent: this.retrieverAgent.toState(),
      area_agent: this.areaAgent.toState(),
      locator_agent: this.locatorAgent.toState(),
      changes_analyzer_agent: this.changesAnalyzerAgent.toState(),
    };
    return state;
  }

  static fromState(state: Session.State): Session {
    const session = new Session({
      sessionId: state["session_id"],
      model: Model.fromState(state["model"]),
      platform: state["platform"],
      tools: state["tools"],
      planner: state["planner"],
      excludeAttributes: new Set(state["exclude_attributes"]),
      // llm is not never in state, see note in to_state.
    });

    session.actorAgent.applyState(state["actor_agent"]);
    session.plannerAgent.applyState(state["planner_agent"]);
    session.retrieverAgent.applyState(state["retriever_agent"]);
    session.areaAgent.applyState(state["area_agent"]);
    session.locatorAgent.applyState(state["locator_agent"]);
    session.changesAnalyzerAgent.applyState(state["changes_analyzer_agent"]);

    return session;
  }

  //#endregion
}

export namespace Session {
  export interface ConstructorProps {
    sessionId: SessionId;
    model: Model;
    platform: Platform;
    tools: ToolDefinition[];
    llm?: BaseChatModel | undefined;
    planner?: boolean | undefined;
    excludeAttributes?: Set<string> | undefined;
  }

  export const Id = z.custom<SessionId>((val) => typeof val === "string", {
    message: "Invalid session ID",
  });

  export const State = z.object({
    session_id: SessionId,
    model: Model.Schema,
    platform: Platform,
    tools: z.array(z.custom<ToolDefinition>()),
    planner: z.boolean(),
    exclude_attributes: z.array(z.string()).default([]),
    actor_agent: Agent.State,
    planner_agent: PlannerAgent.State,
    retriever_agent: Agent.State,
    area_agent: Agent.State,
    locator_agent: Agent.State,
    changes_analyzer_agent: Agent.State,
  });

  export type State = z.infer<typeof Session.State>;
}
