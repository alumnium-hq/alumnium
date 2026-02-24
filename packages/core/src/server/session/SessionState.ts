import { z } from "zod";
import { Model } from "../../model/model.js";
import { ToolSchema } from "../../tool/tool.js";
import { AgentUsage } from "../agents/agent.js";
import { Session } from "./Session.js";

export const SessionStateBaseAgent = z.object({
  usage: AgentUsage,
});

export type SessionStateBaseAgent = z.infer<typeof SessionStateBaseAgent>;

export const SessionStatePlannerAgent = SessionStateBaseAgent.extend({
  examples: z.array(z.unknown()),
});

export type SessionStatePlannerAgent = z.infer<typeof SessionStatePlannerAgent>;

export const SessionState = z.object({
  session_id: Session.Id,
  model: Model,
  platform: z.string(),
  tool_schemas: z.array(ToolSchema),
  actor_agent: SessionStateBaseAgent,
  planner_agent: SessionStatePlannerAgent,
  retriever_agent: SessionStateBaseAgent,
  area_agent: SessionStateBaseAgent,
  locator_agent: SessionStateBaseAgent,
  changes_analyzer_agent: SessionStateBaseAgent,
});

export type SessionState = z.infer<typeof SessionState>;

export function createSessionStateBaseAgent(): SessionStateBaseAgent {
  return {
    usage: {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    },
  };
}

export function createSessionStatePlannerAgent(): SessionStatePlannerAgent {
  return {
    ...createSessionStateBaseAgent(),
    examples: [],
  };
}
