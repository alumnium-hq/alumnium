import { ToolDefinition } from "@langchain/core/language_models/base";
import z from "zod";
import { Provider } from "../Model.js";

export const PLATFORMS = ["chromium", "uiautomator2", "xcuitest"] as const;

export const Platform = z.enum(PLATFORMS);

export type Platform = z.infer<typeof Platform>;

export const SessionId = z.string().brand<"SessionId">();

export type SessionId = z.infer<typeof SessionId>;

export const ApiVersioned = z.object({
  api_version: z.string().default("v1").describe("API version"),
});

export const ErrorResponse = ApiVersioned.extend({
  message: z.string(),
  stack: z.string().optional(),
});

export const PlanActionsBody = z.object({
  goal: z.string(),
  accessibility_tree: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
});

export const PlanActionsResponse = ApiVersioned.extend({
  explanation: z.string(),
  steps: z.array(z.string()),
});

export const PlanStepActionsBody = z.object({
  goal: z.string(),
  step: z.string(),
  accessibility_tree: z.string(),
});

export const ExecuteStatementBody = z.object({
  statement: z.string(),
  accessibility_tree: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  screenshot: z.string().nullable().optional(),
});

export const ChooseAreaBody = z.object({
  description: z.string(),
  accessibility_tree: z.string(),
});

export const FindElementBody = z.object({
  description: z.string(),
  accessibility_tree: z.string(),
});

export const AddExampleBody = z.object({
  goal: z.string(),
  actions: z.array(z.string()),
});

export const ChangeStateSchema = z.object({
  accessibility_tree: z.string(),
  url: z.string(),
});

export const AnalyzeChangesBody = z.object({
  before: ChangeStateSchema,
  after: ChangeStateSchema,
});

export const CreateSessionBody = ApiVersioned.extend({
  platform: Platform,
  provider: z.enum(Provider),
  name: z.string().optional(),
  tools: z.array(z.custom<ToolDefinition>()),
});

export const CreateSessionResponse = ApiVersioned.extend({
  session_id: SessionId,
});

export const SessionParams = z.object({
  session_id: SessionId,
});
