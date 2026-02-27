import { ToolDefinition } from "@langchain/core/language_models/base";
import z from "zod";
import { Provider } from "../Model.js";

//#region Types

export const PLATFORMS = ["chromium", "uiautomator2", "xcuitest"] as const;

export const Platform = z.enum(PLATFORMS);

export type Platform = z.infer<typeof Platform>;

export const SessionId = z.string().brand<"SessionId">();

export type SessionId = z.infer<typeof SessionId>;

export const Usage = z.object({
  input_tokens: z.number(),
  output_tokens: z.number(),
  total_tokens: z.number(),
});

export type Usage = z.infer<typeof Usage>;

export const UsageStats = z.object({
  total: Usage,
  cache: Usage,
});

export type UsageStats = z.infer<typeof UsageStats>;

export const Change = z.object({
  accessibility_tree: z.string(),
  url: z.string(),
});

//#endregion

//#region Common server schemas

export const ApiVersioned = z.object({
  api_version: z.string().default("v1").describe("API version"),
});

export const ErrorResponse = ApiVersioned.extend({
  message: z.string(),
  stack: z.string().optional(),
});

//#endregion

//#region Health check /////////////////////////////////////////////////////////

export const HealthCheckResponse = z.object({
  status: z.literal("healthy"),
  // TODO: Maybe use branded type?
  model: z.string(),
});

//#endregion

//#region Get sessions list ////////////////////////////////////////////////////

export const GetSessionsResponse = z.array(SessionId);

//#endregion

//#region Create session ///////////////////////////////////////////////////////

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

//#endregion

//#region Create plan //////////////////////////////////////////////////////////

export const CreatePlanBody = ApiVersioned.extend({
  goal: z.string(),
  accessibility_tree: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
});

export const CreatePlanResponse = ApiVersioned.extend({
  explanation: z.string(),
  steps: z.array(z.string()),
});

//#endregion

//#region Plan step actions ////////////////////////////////////////////////////

export const PlanStepActionsBody = ApiVersioned.extend({
  goal: z.string(),
  step: z.string(),
  accessibility_tree: z.string(),
});

export const PlanStepActionsResponse = ApiVersioned.extend({
  // TODO: Define proper types
  actions: z.array(z.record(z.string(), z.any())),
});

//#endregion

//#region Add example //////////////////////////////////////////////////////////

export const AddExampleBody = z.object({
  goal: z.string(),
  actions: z.array(z.string()),
});

//#endregion

//#region Clear examples ///////////////////////////////////////////////////////

// TODO

//#endregion

//#region Execute statement ////////////////////////////////////////////////////

export const ExecuteStatementBody = z.object({
  statement: z.string(),
  accessibility_tree: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  screenshot: z.string().nullable().optional(),
});

//#endregion

//#region Choose area //////////////////////////////////////////////////////////

export const ChooseAreaBody = z.object({
  description: z.string(),
  accessibility_tree: z.string(),
});

//#endregion

//#region Find element /////////////////////////////////////////////////////////

export const FindElementBody = z.object({
  description: z.string(),
  accessibility_tree: z.string(),
});

//#endregion

//#region Analyze changes //////////////////////////////////////////////////////

export const AnalyzeChangesBody = z.object({
  before: Change,
  after: Change,
});

//#endregion

//#region Save session cache ///////////////////////////////////////////////////

// TODO

//#endregion

//#region Discard unsaved cache changes ////////////////////////////////////////

// TODO

//#endregion
