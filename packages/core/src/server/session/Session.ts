import { LanguageModel } from "ai";
import { log } from "smollog";
import { z } from "zod";
import { Model } from "../../model/model.js";
import { ToolSchema } from "../../tool/tool.js";
import { ActorAgent } from "../agents/ActorAgent.js";
import { AreaAgent } from "../agents/AreaAgent.js";
import { ChangesAnalyzerAgent } from "../agents/ChangesAnalyzerAgent.js";
import { LocatorAgent } from "../agents/LocatorAgent.js";
import { PlannerAgent } from "../agents/PlannerAgent.js";
import { RetrieverAgent } from "../agents/RetrieverAgent.js";

// TODO: Find a better place for platform consts and types

export const SESSION_PLATFORMS = [
  "chromium",
  "uiautomator2",
  "xcuitest",
] as const;

export const SessionPlatform = z.enum(SESSION_PLATFORMS);

export type SessionPlatform = z.infer<typeof SessionPlatform>;

export class Session {
  sessionId: Session.Id;
  model: Model;
  platform: SessionPlatform;
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

    this.actorAgent = new ActorAgent(); // TODO!
    this.plannerAgent = new PlannerAgent(); // TODO!
    this.retrieverAgent = new RetrieverAgent(); // TODO!
    this.areaAgent = new AreaAgent(); // TODO!
    this.locatorAgent = new LocatorAgent(); // TODO!
    this.changesAnalyzerAgent = new ChangesAnalyzerAgent(); // TODO!

    log.info(
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
}

export namespace Session {
  export type Id = string & { [idBrand]: true };
  declare const idBrand: unique symbol;

  export const Id = z.custom<Session.Id>((val) => typeof val === "string", {
    message: "Invalid session ID",
  });

  export interface ConstructorProps {
    sessionId: Id;
    model: Model;
    platform: SessionPlatform;
    toolSchemas: ToolSchema[];
    llm?: LanguageModel | undefined;
  }
}
