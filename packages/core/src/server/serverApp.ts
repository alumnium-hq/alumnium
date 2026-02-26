import { cors } from "@elysiajs/cors";
import { always } from "alwaysly";
import { Elysia } from "elysia";
import { getLogger } from "../utils/logger.js";
import {
  deleteLegacyStateHook,
  legacyProxy,
  pullLegacyStateHook,
  pushLegacyState,
  pushLegacyStateHook,
} from "./legacy.js";
import * as s from "./serverSchema.js";
import { SessionManager } from "./session/SessionManager.js";

const logger = getLogger(import.meta.url);

//#region Routes

export const serverApp = new Elysia({ prefix: "/v1" })
  .use(cors())
  .onError((ctx) =>
    ctx.status(500, {
      api_version: "1",
      message: ctx.error.toString(),
    }),
  )
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
            // TODO: Figure out how to make all responses versioned without
            // having to manually include api_version in each response type.
            api_version: "1",
            session_id: sessionId,
          };
        },
        {
          body: s.CreateSessionBody,
          response: s.CreateSessionResponse,
          afterHandle: async (ctx) => {
            const { sessions } = ctx.store;
            const session = sessions.getSession(ctx.responseValue.session_id);
            always(session);
            await pushLegacyState(session);
          },
        },
      )
      .group("/:session_id", { params: s.SessionParams }, (app) =>
        app
          .resolve((ctx) => {
            const session = ctx.store.sessions.getSession(
              ctx.params.session_id,
            );
            if (!session) {
              return ctx.status(404, {
                api_version: "1",
                message: "Session not found",
              });
            }
            return { session };
          })

          // Delete session ////////////////////////////////////////////////////
          .delete(
            "/",
            (ctx) => ctx.store.sessions.deleteSession(ctx.params.session_id),
            { afterHandle: deleteLegacyStateHook },
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
                  message: `Failed to plan actions: ${error}`,
                });
              }
            },
            {
              body: s.PlanActionsBody,
              response: {
                200: s.PlanActionsResponse,
                500: s.ErrorResponse,
              },
              afterHandle: pushLegacyStateHook,
            },
          )

          // Plan step actions /////////////////////////////////////////////////
          .post("/steps", legacyProxy, {
            body: s.PlanStepActionsBody,
            afterHandle: pullLegacyStateHook,
          })

          // Add example ///////////////////////////////////////////////////////
          .post("/examples", legacyProxy, {
            body: s.AddExampleBody,
            afterHandle: pullLegacyStateHook,
          })

          // Delete example ////////////////////////////////////////////////////
          .delete("/examples", legacyProxy, {
            afterHandle: pullLegacyStateHook,
          })

          // Execute statement /////////////////////////////////////////////////
          .post("/statements", legacyProxy, {
            body: s.ExecuteStatementBody,
            afterHandle: pullLegacyStateHook,
          })

          // Choose area ///////////////////////////////////////////////////////
          .post("/areas", legacyProxy, {
            body: s.ChooseAreaBody,
            afterHandle: pullLegacyStateHook,
          })

          // Find element //////////////////////////////////////////////////////
          .post("/elements", legacyProxy, {
            body: s.FindElementBody,
            afterHandle: pullLegacyStateHook,
          })

          // Analyze changes ///////////////////////////////////////////////////
          .post("/changes", legacyProxy, {
            body: s.AnalyzeChangesBody,
            afterHandle: pullLegacyStateHook,
          })

          // Save session cache ////////////////////////////////////////////////
          .post("/caches", legacyProxy, {
            afterHandle: pullLegacyStateHook,
          })

          // Discard unsaved cache changes /////////////////////////////////////
          .delete("/caches", legacyProxy, {
            afterHandle: pullLegacyStateHook,
          }),
      ),
  );

//#endregion
