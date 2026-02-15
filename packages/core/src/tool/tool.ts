import { z } from "zod";

export const ToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string(),
    description: z.string(),
    parameters: z.object({
      type: z.literal("object"),
      properties: z.record(z.any(), z.any()),
      required: z.array(z.string()).optional(),
    }),
  }),
});

export type ToolSchema = z.infer<typeof ToolSchema>;
