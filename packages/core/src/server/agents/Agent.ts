import { z } from "zod";

export namespace Agent {
  // TODO: Find a better place for this
  export const Usage = z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  });

  export type Usage = z.infer<typeof Usage>;

  export const State = z.object({
    usage: Usage,
  });

  export type State = z.infer<typeof State>;

  export function createState(): State {
    return {
      usage: {
        input_tokens: 0,
        output_tokens: 0,
        total_tokens: 0,
      },
    };
  }
}
