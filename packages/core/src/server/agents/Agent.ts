import z from "zod";
import { Usage } from "../serverSchema.js";

export namespace Agent {
  export const State = z.object({
    usage: Usage,
  });

  export type State = z.infer<typeof State>;

  // TODO: Find better place

  export function createState(): State {
    return {
      usage: createUsage(),
    };
  }

  export function createUsage(): Usage {
    return {
      input_tokens: 0,
      output_tokens: 0,
      total_tokens: 0,
    };
  }
}
