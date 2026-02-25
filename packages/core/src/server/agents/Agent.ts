import { z } from "zod";

export namespace Agent {
  // TODO: Find a better place for this
  export const Usage = z.object({
    input_tokens: z.number(),
    output_tokens: z.number(),
    total_tokens: z.number(),
  });

  export type Usage = z.infer<typeof Usage>;

  export interface State {
    usage: Usage;
  }
}
