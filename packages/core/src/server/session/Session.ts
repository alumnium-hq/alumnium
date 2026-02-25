import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { z } from "zod";
import { Model } from "../../model/model.js";
import { ToolSchema } from "../../tool/tool.js";
import { getLogger } from "../../utils/logger.js";
import { ActorAgent } from "../agents/ActorAgent.js";
import { Agent } from "../agents/Agent.js";
import { AreaAgent } from "../agents/AreaAgent.js";
import { ChangesAnalyzerAgent } from "../agents/ChangesAnalyzerAgent.js";
import { LocatorAgent } from "../agents/LocatorAgent.js";
import { PlannerAgent } from "../agents/PlannerAgent.js";
import { RetrieverAgent } from "../agents/RetrieverAgent.js";

const logger = getLogger(import.meta.path);

/**
 * Represents a client session with its own agent instances.
 */
export class Session {
  sessionId: Session.Id;
  model: Model;
  platform: Session.Platform;
  toolSchemas: ToolSchema[];
  tools: unknown[];
  llm: LanguageModel;

  // TODO:
  #cache: unknown;

  actorAgent: ActorAgent;
  plannerAgent: PlannerAgent;
  retrieverAgent: RetrieverAgent;
  areaAgent: AreaAgent;
  locatorAgent: LocatorAgent;
  changesAnalyzerAgent: ChangesAnalyzerAgent;

  constructor(props: Session.ConstructorProps) {
    const { sessionId, model, platform, toolSchemas, llm } = props;
    this.sessionId = sessionId;
    this.model = model;
    this.platform = platform;
    this.toolSchemas = toolSchemas;
    // TODO: Convert toolSchemas to tools
    this.tools = {} as any;

    // TODO: Create cache
    this.#cache = {} as any;

    // TODO: Create llm
    this.llm = {} as any;

    // @ts-expect-error -- TODO!
    this.actorAgent = new ActorAgent();
    // @ts-expect-error -- TODO!
    this.plannerAgent = new PlannerAgent();
    // @ts-expect-error -- TODO!
    this.retrieverAgent = new RetrieverAgent();
    // @ts-expect-error -- TODO!
    this.areaAgent = new AreaAgent();
    // @ts-expect-error -- TODO!
    this.locatorAgent = new LocatorAgent();
    // @ts-expect-error -- TODO!
    this.changesAnalyzerAgent = new ChangesAnalyzerAgent(); // TODO!

    logger.info(
      `Created session ${sessionId} with model ${model.provider}/${model.name} and platform ${platform}`,
    );
  }

  // TODO:
  get stats(): unknown {
    return {} as any;
  }

  // TODO:
  processTree() {}

  // TODO:
  toState() {}

  // TODO:
  static fromState() {}

  static createId(): Session.Id {
    return crypto.randomUUID() as Session.Id;
  }

  //#region State

  toState(): Session.State {
    const state: Session.State = {
      session_id: this.sessionId,
      model: this.model,
      platform: this.platform,
      tool_schemas: this.toolSchemas,
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
      model: state["model"],
      platform: state["platform"],
      toolSchemas: state["tool_schemas"],
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
  export type Id = string & { [idBrand]: true };
  declare const idBrand: unique symbol;

  export const PLATFORMS = ["chromium", "uiautomator2", "xcuitest"] as const;

  export const Platform = z.enum(PLATFORMS);

  export type Platform = z.infer<typeof Platform>;

  export interface ConstructorProps {
    sessionId: Id;
    model: Model;
    platform: Platform;
    toolSchemas: ToolSchema[];
    llm?: BaseChatModel | undefined;
  }

  export const Id = z.custom<Session.Id>((val) => typeof val === "string", {
    message: "Invalid session ID",
  });

  export const State = z.object({
    session_id: Session.Id,
    model: Model,
    platform: Session.Platform,
    tool_schemas: z.array(ToolSchema),
    actor_agent: Agent.State,
    planner_agent: PlannerAgent.State,
    retriever_agent: Agent.State,
    area_agent: Agent.State,
    locator_agent: Agent.State,
    changes_analyzer_agent: Agent.State,
  });

  export type State = z.infer<typeof Session.State>;
}
