import { Elysia } from "elysia";
import { z } from "zod";
import { legacyProxy } from "../legacy.ts";

export const SessionParams = z.object({
  session_id: z.string(),
});

const ToolSchema = z.object({
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

const CreateSessionBody = z.object({
  platform: z.enum(["chromium", "uiautomator2", "xcuitest"]),
  provider: z.string(),
  name: z.string().optional(),
  tools: z.array(ToolSchema),
});

export const sessionRoutes = new Elysia()
  .get("/v1/sessions", legacyProxy)
  .post("/v1/sessions", legacyProxy, {
    body: CreateSessionBody,
  })
  .delete("/v1/sessions/:session_id", legacyProxy, {
    params: SessionParams,
  });
