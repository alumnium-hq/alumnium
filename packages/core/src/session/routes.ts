import { Elysia } from "elysia";
import { z } from "zod";
import { ApiVersioned } from "../api/response.ts";
import { legacyFetch, legacyProxy } from "../legacy.ts";
import { ensureModelName, providers } from "../model/model.ts";
import { ToolSchema } from "../tool/tool.ts";
import { Session, SessionPlatform } from "./session.ts";
import {
  createSessionStateBaseAgent,
  createSessionStatePlannerAgent,
  SessionState,
} from "./state.ts";

export const SessionParams = z.object({
  session_id: Session.Id,
});

export const CreateSessionBody = ApiVersioned.extend({
  platform: SessionPlatform,
  provider: z.enum(providers),
  name: z.string().optional(),
  tools: z.array(ToolSchema),
});

export const CreateSessionResponse = ApiVersioned.extend({
  session_id: Session.Id,
});

const sessionStates: Record<Session.Id, SessionState> = {};

export const sessionRoutes = new Elysia()
  .get("/v1/sessions", legacyProxy)
  .post(
    "/v1/sessions",
    async (context) => {
      const { platform, tools: tool_schemas } = context.body;
      const state: SessionState = {
        session_id: Session.createId(),
        model: ensureModelName(context.body),
        platform,
        tool_schemas,
        actor_agent: createSessionStateBaseAgent(),
        planner_agent: createSessionStatePlannerAgent(),
        retriever_agent: createSessionStateBaseAgent(),
        area_agent: createSessionStateBaseAgent(),
        locator_agent: createSessionStateBaseAgent(),
        changes_analyzer_agent: createSessionStateBaseAgent(),
      };
      sessionStates[state.session_id] = state;
      await legacyFetch("/v1/sessions/state", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(state),
      });
      return {
        // TODO: Figure out how to make all responses versioned without having
        // to manually include api_version in each response type.
        api_version: "1",
        session_id: state.session_id,
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
