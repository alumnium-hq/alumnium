/**
 * Kinds of Alumnium agents. Kept free of agent implementations so lightweight
 * modules (e.g. telemetry) can reference them without pulling in the agents.
 */
export type AgentKind =
  | "actor"
  | "area"
  | "changes-analyzer"
  | "locator"
  | "planner"
  | "retriever";
