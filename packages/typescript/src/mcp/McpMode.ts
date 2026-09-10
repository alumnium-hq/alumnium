import z from "zod";

export const McpMode = z.enum(["agentic", "direct"]);

export type McpMode = z.infer<typeof McpMode>;
