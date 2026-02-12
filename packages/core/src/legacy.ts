import { Context } from "elysia";

export const LEGACY_PORT = 8014;
export const LEGACY_ORIGIN = `localhost:${LEGACY_PORT}`;
export const LEGACY_BASE_URL = `http://${LEGACY_ORIGIN}`;

export async function legacyProxy(context: Context): Promise<Response> {
  const { request, body } = context;
  const url = new URL(request.url);
  const targetUrl = `${LEGACY_BASE_URL}${url.pathname}${url.search}`;

  console.log(`Proxying ${request.method} ${url.pathname} -> ${targetUrl}`);

  try {
    const headers = new Headers(request.headers);

    const reqInit: RequestInit = {
      method: request.method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    };

    const response = await fetch(targetUrl, reqInit);

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
