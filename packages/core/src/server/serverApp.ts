import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { z } from "zod";
import { legacyProxy } from "./legacy.js";
import { SessionParams, sessionRoutes } from "./session/sessionRoutes.js";

//#region Types

const PlanActionsBody = z.object({
  goal: z.string(),
  accessibility_tree: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
});

const PlanStepActionsBody = z.object({
  goal: z.string(),
  step: z.string(),
  accessibility_tree: z.string(),
});

const ExecuteStatementBody = z.object({
  statement: z.string(),
  accessibility_tree: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  screenshot: z.string().nullable().optional(),
});

const ChooseAreaBody = z.object({
  description: z.string(),
  accessibility_tree: z.string(),
});

const FindElementBody = z.object({
  description: z.string(),
  accessibility_tree: z.string(),
});

const AddExampleBody = z.object({
  goal: z.string(),
  actions: z.array(z.string()),
});

const ChangeStateSchema = z.object({
  accessibility_tree: z.string(),
  url: z.string(),
});

const AnalyzeChangesBody = z.object({
  before: ChangeStateSchema,
  after: ChangeStateSchema,
});

//#endregion

//#region Routes

export const serverApp = new Elysia()
  .use(cors())
  .get("/health", legacyProxy)
  .use(sessionRoutes)
  .get("/v1/sessions/:session_id/stats", legacyProxy, {
    params: SessionParams,
  })
  .post("/v1/sessions/:session_id/plans", legacyProxy, {
    params: SessionParams,
    body: PlanActionsBody,
  })
  .post("/v1/sessions/:session_id/steps", legacyProxy, {
    params: SessionParams,
    body: PlanStepActionsBody,
  })
  .post("/v1/sessions/:session_id/statements", legacyProxy, {
    params: SessionParams,
    body: ExecuteStatementBody,
  })
  .post("/v1/sessions/:session_id/areas", legacyProxy, {
    params: SessionParams,
    body: ChooseAreaBody,
  })
  .post("/v1/sessions/:session_id/elements", legacyProxy, {
    params: SessionParams,
    body: FindElementBody,
  })
  .post("/v1/sessions/:session_id/examples", legacyProxy, {
    params: SessionParams,
    body: AddExampleBody,
  })
  .delete("/v1/sessions/:session_id/examples", legacyProxy, {
    params: SessionParams,
  })
  .post("/v1/sessions/:session_id/changes", legacyProxy, {
    params: SessionParams,
    body: AnalyzeChangesBody,
  })
  .post("/v1/sessions/:session_id/caches", legacyProxy, {
    params: SessionParams,
  })
  .delete("/v1/sessions/:session_id/caches", legacyProxy, {
    params: SessionParams,
  });

//#endregion
