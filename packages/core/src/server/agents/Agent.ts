import z from "zod";
import { LlmUsage } from "../../llm/llmSchema.js";

export namespace Agent {
  export const State = z.object({
    usage: LlmUsage,
  });

  export type State = z.infer<typeof State>;

  // TODO: Find better place

  export function createState(): State {
    return {
      usage: createUsage(),
    };
  }

  export function createUsage(): LlmUsage {
    return {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    };
  }
}
