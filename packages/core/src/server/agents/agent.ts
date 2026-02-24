import { z } from "zod";

// TODO: Find a better place for this
export const AgentUsage = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
});

export type AgentUsage = z.infer<typeof AgentUsage>;

export interface AgentState {
  usage: AgentUsage;
}
