import { cors } from "@elysiajs/cors";
import { always } from "alwaysly";
import { Elysia } from "elysia";
import { Model } from "../Model.js";
import { getLogger } from "../utils/logger.js";
import { AccessibilityTreeDiff } from "./accessibility/AccessibilityTreeDiff.js";
import {
  deleteLegacyStateHook,
  pushLegacyState,
  pushLegacyStateHook,
} from "./legacy.js";
import * as s from "./serverSchema.js";
import { SessionManager } from "./session/SessionManager.js";

const logger = getLogger(import.meta.url);

//#region Routes

export const serverApp = new Elysia({ prefix: "/v1" })
  .use(cors())
  .onError((ctx) => {
    const { method, url } = ctx.request;
    logger.warn(`${method} ${url} failed: {error}`, {
      error: ctx.error,
    });
    logger.debug("  -> content-type: {contentType}", {
      contentType: ctx.request.headers.get("content-type"),
    });
    logger.debug("  -> body: {body}", { body: ctx.body });

    return ctx.status(500, {
      api_version: "1",
      message: ctx.error.toString(),
      // TODO: Figure out how to pass the stack
      stack: "stack" in ctx.error ? ctx.error.stack : undefined,
    });
  })
  .state("sessions", new SessionManager())

  //#region Health check ///////////////////////////////////////////////////////

  .get(
    "/health",
    (_) => ({
      status: "healthy",
      model: Model.current.toString(),
    }),
    { response: s.HealthCheckResponse },
  )

  //#endregion

  .group("/sessions", (app) =>
    app
      //#region Get sessions list //////////////////////////////////////////////

      .get("/", (ctx) => ctx.store.sessions.listSessions(), {
        response: s.GetSessionsResponse,
      })

      //#endregion

      //#region Create session /////////////////////////////////////////////////

      .post(
        "/",
        (ctx) => {
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

      //#endregion

      .group(
        "/:session_id",
        { params: s.SessionParams },
        (app) =>
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

            //#region Delete session ///////////////////////////////////////////

            .delete(
              "/",
              (ctx) => ctx.store.sessions.deleteSession(ctx.params.session_id),
              { afterHandle: deleteLegacyStateHook },
            )

            //#endregion

            //#region Get session stats ////////////////////////////////////////

            .get("/stats", (ctx) => ctx.session.stats, {
              response: s.UsageStats,
            })

            //#endregion

            //#region Create plan //////////////////////////////////////////////

            .post(
              "/plans",
              async (ctx) => {
                const { session } = ctx;

                try {
                  const accessibilityTree = session.processTree(
                    ctx.body.accessibility_tree,
                  );
                  const [explanation, steps] =
                    await session.plannerAgent.invoke(
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
                body: s.CreatePlanBody,
                response: {
                  200: s.CreatePlanResponse,
                  500: s.ErrorResponse,
                },
                afterHandle: pushLegacyStateHook,
              },
            )

            //#endregion

            //#region Plan step actions ////////////////////////////////////////

            .post(
              "/steps",
              async (ctx) => {
                const { session } = ctx;
                const accessibilityTree = await session.processTree(
                  ctx.body.accessibility_tree,
                );
                const actions = await session.actorAgent.invoke(
                  ctx.body.goal,
                  ctx.body.step,
                  accessibilityTree.toXml(),
                );
                // TODO: Since invoke can return undefined, we need to assert.
                // It might be solved with proper agent types in the future.
                always(actions);
                return {
                  api_version: "1",
                  actions,
                };
              },
              {
                body: s.PlanStepActionsBody,
                response: s.PlanStepActionsResponse,
                afterHandle: pushLegacyStateHook,
              },
            )

            //#endregion

            //#region Add example //////////////////////////////////////////////

            .post(
              "/examples",
              async (ctx) => {
                const { session } = ctx;
                await session.plannerAgent.addExample(
                  ctx.body.goal,
                  ctx.body.actions,
                );
                return {
                  api_version: "1",
                  success: true,
                  message: "Example added successfully",
                };
              },
              {
                body: s.AddExampleBody,
                response: s.SuccessResponse,
                afterHandle: pushLegacyStateHook,
              },
            )

            //#endregion

            //#region Clear examples ///////////////////////////////////////////

            .delete(
              "/examples",
              (ctx) => {
                const { session } = ctx;
                session.plannerAgent.promptWithExamples.examples = [];
                return {
                  api_version: "1",
                  success: true,
                  message: "All examples cleared successfully",
                };
              },
              {
                response: s.SuccessResponse,
                afterHandle: pushLegacyStateHook,
              },
            )

            //#endregion

            //#region Execute statement ////////////////////////////////////////

            .post(
              "/statements",
              async (ctx) => {
                const { session } = ctx;
                const accessibilityTree = await session.processTree(
                  ctx.body.accessibility_tree,
                );
                const [explanation, value] =
                  await session.retrieverAgent.invoke(
                    ctx.body.statement,
                    accessibilityTree.toXml(),
                    ctx.body.title,
                    ctx.body.url,
                    ctx.body.screenshot,
                  );
                return {
                  api_version: "1",
                  result: value,
                  explanation,
                };
              },
              {
                body: s.ExecuteStatementBody,
                response: s.ExecuteStatementResponse,
                afterHandle: pushLegacyStateHook,
              },
            )

            //#region Choose area //////////////////////////////////////////////

            .post(
              "/areas",
              async (ctx) => {
                const { session } = ctx;
                const accessibilityTree = await session.processTree(
                  ctx.body.accessibility_tree,
                );
                const { id: simplifiedId, explanation } =
                  await session.areaAgent.invoke(
                    ctx.body.description,
                    accessibilityTree.toXml(),
                  );
                const id = accessibilityTree.getRawId(simplifiedId);
                return {
                  api_version: "1",
                  id,
                  explanation,
                };
              },
              {
                body: s.ChooseAreaBody,
                response: s.ChooseAreaResponse,
                afterHandle: pushLegacyStateHook,
              },
            )

            //#endregion

            //#region Find element /////////////////////////////////////////////

            .post(
              "/elements",
              async (ctx) => {
                const { session } = ctx;
                const accessibilityTree = await session.processTree(
                  ctx.body.accessibility_tree,
                );
                const elements = await session.locatorAgent.invoke(
                  ctx.body.description,
                  accessibilityTree.toXml(),
                );
                return {
                  api_version: "1",
                  elements,
                };
              },
              {
                body: s.FindElementBody,
                response: s.FindElementResponse,
                afterHandle: pushLegacyStateHook,
              },
            )

            //#endregion

            //#region Analyze changes //////////////////////////////////////////

            .post(
              "/changes",
              async (ctx) => {
                const {
                  session,
                  body: { before, after },
                } = ctx;
                const beforeTree = await session.processTree(
                  before.accessibility_tree,
                );
                const afterTree = await session.processTree(
                  after.accessibility_tree,
                );
                const excludeAttrs = new Set(["id"]);
                const diff = new AccessibilityTreeDiff(
                  beforeTree.toXml(excludeAttrs),
                  afterTree.toXml(excludeAttrs),
                );

                let analysis = "";
                if (before.url && after.url) {
                  if (before.url !== after.url) {
                    analysis += `URL changed to ${after.url}. `;
                  } else {
                    analysis += "URL did not change. ";
                  }
                }

                analysis += session.changesAnalyzerAgent.invoke(diff.compute());

                return {
                  api_version: "1",
                  result: analysis,
                };
              },
              {
                body: s.AnalyzeChangesBody,
                response: s.AnalyzeChangesResponse,
                afterHandle: pushLegacyStateHook,
              },
            )

            //#region Save session cache ///////////////////////////////////////

            .post(
              "/caches",
              async (ctx) => {
                const { session } = ctx;
                await session.cache.save();
                return {
                  api_version: "1",
                  success: true,
                  message: "Cache saved successfully",
                };
              },
              {
                response: s.SuccessResponse,
                afterHandle: pushLegacyStateHook,
              },
            )

            //#endregion

            //#region Discard unsaved cache changes ////////////////////////////

            .delete(
              "/caches",
              async (ctx) => {
                const { session } = ctx;
                await session.cache.discard();
                return {
                  api_version: "1",
                  success: true,
                  message: "Cache discarded successfully",
                };
              },
              {
                response: s.SuccessResponse,
                afterHandle: pushLegacyStateHook,
              },
            ),

        //#endregion
      ),
  );

//#endregion
