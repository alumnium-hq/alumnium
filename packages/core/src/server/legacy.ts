import { Context } from "elysia";
import { Session } from "./session/Session.js";

export const LEGACY_PORT = 8014;
export const LEGACY_ORIGIN = `localhost:${LEGACY_PORT}`;
export const LEGACY_BASE_URL = `http://${LEGACY_ORIGIN}`;

export async function legacyProxy(ctx: Context): Promise<Response> {
  const { request, body } = ctx;
  const url = new URL(request.url);
  const path = `${url.pathname}${url.search}`;

  console.log(`Proxying ${request.method} ${path} -> ${legacyUrl(path)}`);

  try {
    const headers = new Headers(request.headers);

    const response = await legacyFetch(path, {
      method: request.method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });

    const responseBody = await response.blob();

    return new Response(responseBody, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    });
  } catch (err) {
    console.error("Proxy error:", err);

    return new Response(
      JSON.stringify({ error: "Proxy failed", detail: String(err) }),
      {
        status: 502,
        headers: { "Content-Type": "application/json" },
      },
    );
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
  await legacyFetch("/v1/sessions/state", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(state),
  });
}

export namespace pushLegacyStateHook {
  export interface Context {
    session: Session;
  }
}

export function pushLegacyStateHook(ctx: pushLegacyStateHook.Context) {
  const { session } = ctx;
  return pushLegacyState(session);
}

export async function deleteLegacyState(sessionId: Session.Id) {
  delete sessionStates[sessionId];
  await legacyFetch(`/v1/sessions/state/${sessionId}`, {
    method: "DELETE",
  });
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
    params: SessionParams;
  }

  export interface SessionParams {
    session_id: Session.Id;
  }
}

export function pullLegacyStateHook(ctx: pullLegacyStateHook.Context) {
  const { params } = ctx;
  return pullLegacyState(params.session_id);
}
