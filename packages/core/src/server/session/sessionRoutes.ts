import { ToolDefinition } from "@langchain/core/language_models/base";
import { always } from "alwaysly";
import { Elysia } from "elysia";
import z from "zod";
import { ApiVersioned } from "../../api/response.js";
import { Provider } from "../../Model.js";
import { legacyFetch, legacyProxy } from "../legacy.js";
import { Session } from "./Session.js";
import { SessionManager } from "./SessionManager.js";

export const SessionParams = z.object({
  session_id: Session.Id,
});

export const CreateSessionBody = ApiVersioned.extend({
  platform: Session.Platform,
  provider: z.enum(Provider),
  name: z.string().optional(),
  tools: z.array(z.custom<ToolDefinition>()),
});

export const CreateSessionResponse = ApiVersioned.extend({
  session_id: Session.Id,
});

const sessionStates: Record<Session.Id, Session.State> = {};
const sessionManager = new SessionManager();

export const sessionRoutes = new Elysia()
  .get("/v1/sessions", legacyProxy)
  .post(
    "/v1/sessions",
    async (context) => {
      const sessionId = sessionManager.createSession(context.body);

      //#region Legacy
      const session = sessionManager.getSession(sessionId);
      always(session);
      const state = session.toState();
      sessionStates[sessionId] = state;
      await legacyFetch("/v1/sessions/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      //#endregion

      return {
        // TODO: Figure out how to make all responses versioned without having
        // to manually include api_version in each response type.
        api_version: "1",
        session_id: sessionId,
      };
    },
    { body: CreateSessionBody, response: CreateSessionResponse },
  )
  .delete(
    "/v1/sessions/:session_id",
    async (context) => {
      const { session_id } = context.params;
      delete sessionStates[session_id];
      await legacyFetch(`/v1/sessions/state/${session_id}`, {
        method: "DELETE",
      });
    },
    { params: SessionParams },
  );
