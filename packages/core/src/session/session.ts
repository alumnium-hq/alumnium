import { LanguageModel } from "ai";
import { log } from "smollog";
import { z } from "zod";
import { Model } from "../model/model.ts";
import { ActorAgent } from "../server/agents/ActorAgent.ts";
import { AreaAgent } from "../server/agents/AreaAgent.ts";
import { ChangesAnalyzerAgent } from "../server/agents/ChangesAnalyzerAgent.ts";
import { LocatorAgent } from "../server/agents/LocatorAgent.ts";
import { PlannerAgent } from "../server/agents/PlannerAgent.ts";
import { RetrieverAgent } from "../server/agents/RetrieverAgent.ts";
import { ToolSchema } from "../tool/tool.ts";

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
