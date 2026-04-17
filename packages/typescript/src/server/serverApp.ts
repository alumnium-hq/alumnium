import { cors } from "@elysiajs/cors";
import { Elysia } from "elysia";
import { LlmUsageStats } from "../llm/llmSchema.ts";
import { Model } from "../Model.ts";
import { getLogger } from "../utils/logger.ts";
import { AccessibilityTreeDiff } from "./accessibility/AccessibilityTreeDiff.ts";
import { ChangesAnalyzerAgent } from "./agents/ChangesAnalyzerAgent.ts";
import { RetrieverAgent } from "./agents/RetrieverAgent.ts";
import * as s from "./serverSchema.ts";
import { Session } from "./session/Session.ts";
import { SessionManager } from "./session/SessionManager.ts";

const logger = getLogger(import.meta.url);

//#region Routes

export const serverApp = new Elysia({ prefix: "/v1" })
  .use(cors())
  .state(() => ({ sessions: new SessionManager() }))
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
      message: ctx.error.toString(),
      // TODO: Figure out how to pass the stack
      stack: "stack" in ctx.error ? ctx.error.stack : undefined,
    });
  })

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
          const session = ctx.store.sessions.createSession(ctx.body);
          return {
            session_id: session.sessionId,
          };
        },
        {
          body: s.CreateSessionBody,
          response: s.CreateSessionResponse,
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
                  message: "Session not found",
                });
              }
              return {
                session,
              };
            })

            //#region Delete session ///////////////////////////////////////////

            .delete("/", (ctx) =>
              ctx.store.sessions.deleteSession(ctx.params.session_id),
            )

            //#endregion

            //#region Get session stats ////////////////////////////////////////

            .get("/stats", (ctx) => ctx.session.stats, {
              response: LlmUsageStats,
            })

            //#endregion

            //#region Get session configuration ////////////////////////////////

            .get("/configuration", (ctx) => ctx.session.configuration, {
              response: Session.Configuration,
            })

            //#endregion

            //#region Create plan //////////////////////////////////////////////

            .post(
              "/plans",
              async (ctx) => {
                const { session } = ctx;

                try {
                  if (!session.planner) {
                    return {
                      explanation: ctx.body.goal,
                      steps: [ctx.body.goal],
                    };
                  }

                  session.updateContext({ app: ctx.body.app });

                  const accessibilityTree = session.processTree(
                    ctx.body.accessibility_tree,
                  );
                  const [explanation, steps] =
                    await session.plannerAgent.invoke(
                      ctx.body.goal,
                      accessibilityTree.toXml(session.excludeAttributes),
                    );
                  return {
                    explanation,
                    steps,
                  };
                } catch (error) {
                  logger.error(`Error generating plan: ${error}`);
                  return ctx.status(500, {
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
              },
            )

            //#endregion

            //#region Plan step actions ////////////////////////////////////////

            .post(
              "/steps",
              async (ctx) => {
                const { session } = ctx;
                session.updateContext({ app: ctx.body.app });

                const accessibilityTree = session.processTree(
                  ctx.body.accessibility_tree,
                );
                const [explanation, actions] = await session.actorAgent.invoke(
                  ctx.body.goal,
                  ctx.body.step,
                  accessibilityTree.toXml(session.excludeAttributes),
                );
                return {
                  explanation,
                  actions: accessibilityTree.mapToolCallsToRawId(actions),
                };
              },
              {
                body: s.PlanStepActionsBody,
                response: s.PlanStepActionsResponse,
              },
            )

            //#endregion

            //#region Add example //////////////////////////////////////////////

            .post(
              "/examples",
              async (ctx) => {
                const { session } = ctx;
                session.plannerAgent.addExample(
                  ctx.body.goal,
                  ctx.body.actions,
                );
                return {
                  success: true,
                  message: "Example added successfully",
                };
              },
              {
                body: s.AddExampleBody,
                response: s.SuccessResponse,
              },
            )

            //#endregion

            //#region Clear examples ///////////////////////////////////////////

            .delete(
              "/examples",
              (ctx) => {
                const { session } = ctx;
                session.plannerAgent.clearExamples();
                return {
                  success: true,
                  message: "All examples cleared successfully",
                };
              },
              {
                response: s.SuccessResponse,
              },
            )

            //#endregion

            //#region Execute statement ////////////////////////////////////////

            .post(
              "/statements",
              async (ctx) => {
                const { session } = ctx;
                session.updateContext({ app: ctx.body.app });

                const accessibilityTree = session.processTree(
                  ctx.body.accessibility_tree,
                );
                const [explanation, value] =
                  await session.retrieverAgent.invoke(
                    ctx.body.statement,
                    accessibilityTree.toXml(
                      new Set([
                        ...RetrieverAgent.EXCLUDE_ATTRIBUTES,
                        ...session.excludeAttributes,
                      ]),
                    ),
                    ctx.body.title,
                    ctx.body.url,
                    ctx.body.screenshot,
                  );
                return {
                  result: value,
                  explanation,
                };
              },
              {
                body: s.ExecuteStatementBody,
                response: s.ExecuteStatementResponse,
              },
            )

            //#region Choose area //////////////////////////////////////////////

            .post(
              "/areas",
              async (ctx) => {
                const { session } = ctx;
                session.updateContext({ app: ctx.body.app });

                const accessibilityTree = session.processTree(
                  ctx.body.accessibility_tree,
                );
                const { id: simplifiedId, explanation } =
                  await session.areaAgent.invoke(
                    ctx.body.description,
                    accessibilityTree.toXml(session.excludeAttributes),
                  );
                const id = accessibilityTree.getRawId(simplifiedId);
                return {
                  id,
                  explanation,
                };
              },
              {
                body: s.ChooseAreaBody,
                response: s.ChooseAreaResponse,
              },
            )

            //#endregion

            //#region Find element /////////////////////////////////////////////

            .post(
              "/elements",
              async (ctx) => {
                const { session } = ctx;
                session.updateContext({ app: ctx.body.app });

                const accessibilityTree = session.processTree(
                  ctx.body.accessibility_tree,
                );
                const elements = await session.locatorAgent.invoke(
                  ctx.body.description,
                  accessibilityTree.toXml(session.excludeAttributes),
                );
                return {
                  elements,
                };
              },
              {
                body: s.FindElementBody,
                response: s.FindElementResponse,
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
                session.updateContext({ app: ctx.body.app });

                const beforeTree = session.processTree(
                  before.accessibility_tree,
                );
                const afterTree = session.processTree(after.accessibility_tree);
                const excludeAttrs = new Set([
                  ...ChangesAnalyzerAgent.EXCLUDE_ATTRIBUTES,
                  ...session.excludeAttributes,
                ]);
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

                analysis += await session.changesAnalyzerAgent.invoke(
                  diff.compute(),
                );

                return {
                  result: analysis,
                };
              },
              {
                body: s.AnalyzeChangesBody,
                response: s.AnalyzeChangesResponse,
              },
            )

            //#region Save session cache ///////////////////////////////////////

            .post(
              "/caches",
              async (ctx) => {
                const { session } = ctx;
                await session.cache.save();
                return {
                  success: true,
                  message: "Cache saved successfully",
                };
              },
              {
                response: s.SuccessResponse,
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
                  success: true,
                  message: "Cache discarded successfully",
                };
              },
              {
                response: s.SuccessResponse,
              },
            ),

        //#endregion
      ),
  );

//#endregion
