import z from "zod";
import { createLlmUsage, LlmUsage } from "../../llm/llmSchema.js";

export namespace Agent {
  export const State = z.object({
    usage: LlmUsage,
  });

  export type State = z.infer<typeof State>;

  // TODO: Find better place

  export function createState(): State {
    return {
      usage: createLlmUsage(),
    };
  }
}
