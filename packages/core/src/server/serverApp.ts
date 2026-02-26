import { cors } from "@elysiajs/cors";
import { ToolDefinition } from "@langchain/core/language_models/base";
import { always } from "alwaysly";
import { Elysia } from "elysia";
import z from "zod";
import { ApiVersioned } from "../api/response.js";
import { Provider } from "../Model.js";
import { getLogger } from "../utils/logger.js";
import {
  deleteLegacyState,
  legacyProxy,
  pullLegacyStateHook,
  pushLegacyState,
  pushLegacyStateHook,
} from "./legacy.js";
import { Session } from "./session/Session.js";
import { SessionManager } from "./session/SessionManager.js";

const logger = getLogger(import.meta.url);

//#region Types

export const ErrorResponse = ApiVersioned.extend({
  error: z.string(),
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

export const CreateSessionBody = ApiVersioned.extend({
  platform: Session.Platform,
  provider: z.enum(Provider),
  name: z.string().optional(),
  tools: z.array(z.custom<ToolDefinition>()),
});

export const CreateSessionResponse = ApiVersioned.extend({
  session_id: Session.Id,
});

export const SessionParams = z.object({
  session_id: Session.Id,
});

export const serverApp = new Elysia({ prefix: "/v1" })
  .use(cors())
  .state("sessions", new SessionManager())
  // Health check //////////////////////////////////////////////////////////////
  .get("/health", legacyProxy)

  .group("/sessions", (app) =>
    app
      // Get sessions list /////////////////////////////////////////////////////
      .get("/", legacyProxy)

      // Create session ////////////////////////////////////////////////////////
      .post(
        "/",
        async (ctx) => {
          const sessionId = ctx.store.sessions.createSession(ctx.body);
          return {
            // TODO: Figure out how to make all responses versioned without having
            // to manually include api_version in each response type.
            api_version: "1",
            session_id: sessionId,
          };
        },
        {
          body: CreateSessionBody,
          response: CreateSessionResponse,
          afterHandle: async (ctx) => {
            const { sessions } = ctx.store;
            const session = sessions.getSession(ctx.responseValue.session_id);
            always(session);
            await pushLegacyState(session);
          },
        },
      )
      .group("/:session_id", { params: SessionParams }, (app) =>
        app
          .derive((ctx) => {
            const session = ctx.store.sessions.getSession(
              ctx.params.session_id,
            );
            if (!session) {
              return ctx.status(404, {
                api_version: "1",
                error: "Session not found",
              });
            }
            return { session };
          })

          // Delete session ////////////////////////////////////////////////////
          .delete(
            "/",
            (ctx) => ctx.store.sessions.deleteSession(ctx.params.session_id),
            { afterHandle: (ctx) => deleteLegacyState(ctx.params.session_id) },
          )

          // Get session stats /////////////////////////////////////////////////
          .get("/stats", (ctx) => ctx.session.stats)

          // Create plan ///////////////////////////////////////////////////////
          .post(
            "/plans",
            async (ctx) => {
              const { session } = ctx;

              try {
                const accessibilityTree = session.processTree(
                  ctx.body.accessibility_tree,
                );
                const [explanation, steps] = await session.plannerAgent.invoke(
                  ctx.body.goal,
                  accessibilityTree.toXml(),
                );
                return {
                  api_version: "1",
                  explanation,
                  steps,
                };
              } catch (error) {
                logger.error(`Error generating plan: ${error}`);
                return ctx.status(500, {
                  api_version: "1",
                  error: `Failed to plan actions: ${error}`,
                });
              }
            },
            {
              params: SessionParams,
              body: PlanActionsBody,
              response: {
                200: PlanActionsResponse,
                500: ErrorResponse,
              },
              afterHandle: pushLegacyStateHook,
            },
          )
          .group("/", { afterHandle: pullLegacyStateHook }, (app) =>
            app
              // Plan step actions /////////////////////////////////////////////
              .post("/steps", legacyProxy, {
                body: PlanStepActionsBody,
              })

              // Add example ///////////////////////////////////////////////////
              .post("/examples", legacyProxy, {
                body: AddExampleBody,
              })

              // Delete example ////////////////////////////////////////////////
              .delete("/examples", legacyProxy, {})

              // Execute statement /////////////////////////////////////////////
              .post("/statements", legacyProxy, {
                body: ExecuteStatementBody,
              })

              // Choose area ///////////////////////////////////////////////////
              .post("/areas", legacyProxy, {
                body: ChooseAreaBody,
                afterHandle: pullLegacyStateHook,
              })

              // Find element //////////////////////////////////////////////////
              .post("/elements", legacyProxy, {
                body: FindElementBody,
                afterHandle: pullLegacyStateHook,
              })

              // Analyze changes ///////////////////////////////////////////////
              .post("/changes", legacyProxy, {
                body: AnalyzeChangesBody,
                afterHandle: pullLegacyStateHook,
              })

              // Save session cache ////////////////////////////////////////////
              .post("/caches", legacyProxy, {
                afterHandle: pullLegacyStateHook,
              })

              // Discard unsaved cache changes /////////////////////////////////
              .delete("/caches", legacyProxy, {
                afterHandle: pullLegacyStateHook,
              }),
          ),
      ),
  );

//#endregion
