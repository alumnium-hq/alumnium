import type { ActorAgent } from "./ActorAgent.ts";
import type { AreaAgent } from "./AreaAgent.ts";
import type { ChangesAnalyzerAgent } from "./ChangesAnalyzerAgent.ts";
import type { LocatorAgent } from "./LocatorAgent.ts";
import type { PlannerAgent } from "./PlannerAgent.ts";
import type { RetrieverAgent } from "./RetrieverAgent.ts";

export namespace Agent {
  export type Meta =
    | ActorAgent.Meta
    | AreaAgent.Meta
    | ChangesAnalyzerAgent.Meta
    | LocatorAgent.Meta
    | PlannerAgent.Meta
    | RetrieverAgent.Meta;

  export type Kind = Meta["kind"];
}
