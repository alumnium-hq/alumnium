import { Context } from "elysia";
import { getLogger } from "../utils/logger.js";
import { Session } from "./session/Session.js";

const logger = getLogger(import.meta.url);

export const LEGACY_PORT = 8014;
export const LEGACY_ORIGIN = `localhost:${LEGACY_PORT}`;
export const LEGACY_BASE_URL = `http://${LEGACY_ORIGIN}`;

export async function legacyProxy(ctx: Context) {
  const { request, body } = ctx;
  const url = new URL(request.url);
  const path = `${url.pathname}${url.search}`;

  logger.info(`Proxying ${request.method} ${path} -> ${legacyUrl(path)}`);

  try {
    const headers = new Headers(request.headers);

    const response = await legacyFetch(path, {
      method: request.method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    let responseBody: Blob | undefined = undefined;
    try {
      responseBody = await response.blob();
    } catch (err) {
      // NOTE: Some methods respond with no body
      logger.debug(`Failed to read response body as blob: ${err}`);
    }

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (err) {
    logger.error("Proxy error: {err}", { err });

    return ctx.status(502, { error: "Proxy failed", detail: String(err) });
  }
}

export async function legacyFetch(path: string, init: RequestInit) {
  return fetch(legacyUrl(path), init);
}

export function legacyUrl(path: string) {
  return `${LEGACY_BASE_URL}${path}`;
}

const sessionStates: Record<Session.Id, Session.State> = {};

export async function pushLegacyState(session: Session) {
  const state = session.toState();
  sessionStates[session.sessionId] = state;
  logger.info(`Pushing legacy state for session ${session.sessionId}`);
  logger.debug(`State: {state}`, { state });
  await legacyFetch("/v1/sessions/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ state }),
  });
}

export namespace pushLegacyStateHook {
  export interface Context {
    session: Session;
  }
}

export function pushLegacyStateHook(ctx: pushLegacyStateHook.Context) {
  return pushLegacyState(ctx.session);
}

export async function deleteLegacyState(sessionId: Session.Id) {
  delete sessionStates[sessionId];
  await legacyFetch(`/v1/sessions/${sessionId}`, {
    method: "DELETE",
  });
}

export namespace deleteLegacyStateHook {
  export interface Context {
    params: Params;
  }

  export interface Params {
    session_id: Session.Id;
  }
}

export function deleteLegacyStateHook(ctx: deleteLegacyStateHook.Context) {
  return deleteLegacyState(ctx.params.session_id);
}

export async function pullLegacyState(sessionId: Session.Id) {
  const response = await legacyFetch(`/v1/sessions/${sessionId}/state`, {
    method: "GET",
  });
  const state = Session.State.parse(await response.text());
  sessionStates[sessionId] = state;
}

export namespace pullLegacyStateHook {
  export interface Context {
    params: Params;
  }

  export interface Params {
    session_id: Session.Id;
  }
}

export function pullLegacyStateHook(ctx: pullLegacyStateHook.Context) {
  return pullLegacyState(ctx.params.session_id);
}
