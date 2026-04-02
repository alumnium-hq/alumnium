import type { ToolDefinition } from "@langchain/core/language_models/base";
import z from "zod";
import { AppId } from "../AppId.ts";
import { Driver } from "../drivers/Driver.ts";
import { Model } from "../Model.ts";
import { SessionId } from "./session/SessionId.ts";

//#region Types

export const Change = z.object({
  accessibility_tree: z.string(),
  url: z.string(),
});

export const ElementRef = z.object({
  id: z.number(),
  explanation: z.string().optional(),
});

export type ElementRef = z.infer<typeof ElementRef>;

//#endregion

//#region Common server schemas

export const ErrorResponse = z.object({
  message: z.string(),
  stack: z.string().optional(),
});

export const SuccessResponse = z.object({
  success: z.literal(true),
  message: z.string(),
});

export const CacheableRequestBody = z.object({
  app: AppId,
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

export const CreateSessionBody = z.object({
  platform: Driver.Platform,
  provider: Model.Provider,
  name: z.string().optional(),
  tools: z.array(z.custom<ToolDefinition>()),
  planner: z.boolean().default(true),
  exclude_attributes: z.array(z.string()).default([]),
});

export const CreateSessionResponse = z.object({
  session_id: SessionId,
});

export const SessionParams = z.object({
  session_id: SessionId,
});

//#endregion

//#region Create plan //////////////////////////////////////////////////////////

export const CreatePlanBody = CacheableRequestBody.extend({
  goal: z.string(),
  accessibility_tree: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
});

export const CreatePlanResponse = z.object({
  explanation: z.string(),
  steps: z.array(z.string()),
});

//#endregion

//#region Plan step actions ////////////////////////////////////////////////////

export const PlanStepActionsBody = CacheableRequestBody.extend({
  goal: z.string(),
  step: z.string(),
  accessibility_tree: z.string(),
});

export const PlanStepActionsResponse = z.object({
  explanation: z.string(),
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

//#region Execute statement ////////////////////////////////////////////////////

export const ExecuteStatementBody = CacheableRequestBody.extend({
  statement: z.string(),
  accessibility_tree: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  screenshot: z.string().nullable().optional(),
});

export const ExecuteStatementResponse = z.object({
  result: z.union([z.string(), z.array(z.string())]),
  explanation: z.string(),
});

//#endregion

//#region Choose area //////////////////////////////////////////////////////////

export const ChooseAreaBody = CacheableRequestBody.extend({
  description: z.string(),
  accessibility_tree: z.string(),
});

export const ChooseAreaResponse = z.object({
  id: z.number(),
  explanation: z.string(),
});

//#endregion

//#region Find element /////////////////////////////////////////////////////////

export const FindElementBody = CacheableRequestBody.extend({
  description: z.string(),
  accessibility_tree: z.string(),
});

export const FindElementResponse = z.object({
  elements: z.array(ElementRef),
});

//#endregion

//#region Analyze changes //////////////////////////////////////////////////////

export const AnalyzeChangesBody = CacheableRequestBody.extend({
  before: Change,
  after: Change,
});

export const AnalyzeChangesResponse = z.object({
  result: z.string(),
});

//#endregion

//#region Clear cache //////////////////////////////////////////////////////////

export const ClearCacheBody = z.record(z.string(), z.unknown());

//#endregion
