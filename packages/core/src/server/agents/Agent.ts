import z from "zod";
import { createLlmUsage, LlmUsage } from "../../llm/llmSchema.js";
import type { ActorAgent } from "./ActorAgent.js";
import type { PlannerAgent } from "./PlannerAgent.js";
import type { AreaAgent } from "./AreaAgent.js";
import type { ChangesAnalyzerAgent } from "./ChangesAnalyzerAgent.js";
import type { LocatorAgent } from "./LocatorAgent.js";
import type { RetrieverAgent } from "./RetrieverAgent.js";

export namespace Agent {
  export type State = z.infer<typeof Agent.State>;

    export type Meta =
      | ActorAgent.Meta
      | AreaAgent.Meta
      | ChangesAnalyzerAgent.Meta
      | LocatorAgent.Meta
      | PlannerAgent.Meta
      | RetrieverAgent.Meta;
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
