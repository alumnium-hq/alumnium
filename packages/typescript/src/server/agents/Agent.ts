import z from "zod";
import { createLlmUsage, LlmUsage } from "../../llm/llmSchema.ts";
import type { ActorAgent } from "./ActorAgent.ts";
import type { AreaAgent } from "./AreaAgent.ts";
import type { ChangesAnalyzerAgent } from "./ChangesAnalyzerAgent.ts";
import type { LocatorAgent } from "./LocatorAgent.ts";
import type { PlannerAgent } from "./PlannerAgent.ts";
import type { RetrieverAgent } from "./RetrieverAgent.ts";

export namespace Agent {
  export type State = z.infer<typeof Agent.State>;

  export type Meta =
    | ActorAgent.Meta
    | AreaAgent.Meta
    | ChangesAnalyzerAgent.Meta
    | LocatorAgent.Meta
    | PlannerAgent.Meta
    | RetrieverAgent.Meta;

  export type Kind = Meta["kind"];
}

export abstract class Agent {
  static State = z.object({
    usage: LlmUsage,
  });

  static createState(): Agent.State {
    return {
      usage: createLlmUsage(),
    };
  }
}
