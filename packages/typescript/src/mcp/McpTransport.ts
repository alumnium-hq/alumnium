import z from "zod";

export const McpTransport = z.enum(["stdio", "http"]);

export type McpTransport = z.infer<typeof McpTransport>;
