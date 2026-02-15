import { Context } from "elysia";

export const LEGACY_PORT = 8014;
export const LEGACY_ORIGIN = `localhost:${LEGACY_PORT}`;
export const LEGACY_BASE_URL = `http://${LEGACY_ORIGIN}`;

export async function legacyProxy(context: Context): Promise<Response> {
  const { request, body } = context;
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
