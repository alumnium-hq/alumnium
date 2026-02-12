import { Context, Elysia } from "elysia";
import { parseArgs } from "util";
import { z } from "zod";

//#region CLI

const args = parseArgs({
  args: Bun.argv,
  options: {
    port: {
      type: "string",
      default: "8013",
    },
    "legacy-port": {
      type: "string",
      default: "8014",
    },
    "legacy-image": {
      type: "string",
    },
  },
  strict: true,
  allowPositionals: true,
});

const PORT = parseInt(args.values.port || "8013");
const LEGACY_PORT = parseInt(args.values["legacy-port"] || "8014");
const LEGACY_ORIGIN = `localhost:${LEGACY_PORT}`;
const LEGACY_BASE_URL = `http://${LEGACY_ORIGIN}`;

console.log(`Starting at http://localhost:${PORT}`);
console.log(`🟡 Proxying to legacy server at ${LEGACY_BASE_URL}`);

//#endregion

//#region Types

const ToolSchema = z.object({
  type: z.literal("function"),
  function: z.object({
    name: z.string().min(1),
    description: z.string().min(1),
    parameters: z.object({
      type: z.literal("object"),
      properties: z.record(z.any(), z.any()),
      required: z.array(z.string()).optional(),
    }),
  }),
});

const CreateSessionBody = z.object({
  platform: z.enum(["chromium", "uiautomator2", "xcuitest"]),
  provider: z.string().min(1),
  name: z.string().min(1).optional(),
  tools: z.array(ToolSchema).min(1),
});

const SessionParams = z.object({
  session_id: z.string().min(1),
});

const PlanActionsBody = z.object({
  goal: z.string().min(1),
  accessibility_tree: z.string().min(1),
  url: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
});

const PlanStepActionsBody = z.object({
  goal: z.string().min(1),
  step: z.string().min(1),
  accessibility_tree: z.string().min(1),
});

const ExecuteStatementBody = z.object({
  statement: z.string().min(1),
  accessibility_tree: z.string().min(1),
  url: z.string().min(1).optional(),
  title: z.string().min(1).optional(),
  screenshot: z.string().min(1).nullable().optional(),
});

const ChooseAreaBody = z.object({
  description: z.string().min(1),
  accessibility_tree: z.string().min(1),
});

const FindElementBody = z.object({
  description: z.string().min(1),
  accessibility_tree: z.string().min(1),
});

const AddExampleBody = z.object({
  goal: z.string().min(1),
  actions: z.array(z.string().min(1)).min(1),
});

const ChangeStateSchema = z.object({
  accessibility_tree: z.string().min(1),
  url: z.string().min(1),
});

const AnalyzeChangesBody = z.object({
  before: ChangeStateSchema,
  after: ChangeStateSchema,
});

//#endregion

//#region Routes

const app = new Elysia()
  .get("/health", proxyRequest)
  .get("/v1/sessions", proxyRequest)
  .post("/v1/sessions", proxyRequest, {
    body: CreateSessionBody,
  })
  .delete("/v1/sessions/:session_id", proxyRequest, {
    params: SessionParams,
  })
  .get("/v1/sessions/:session_id/stats", proxyRequest, {
    params: SessionParams,
  })
  .post("/v1/sessions/:session_id/plans", proxyRequest, {
    params: SessionParams,
    body: PlanActionsBody,
  })
  .post("/v1/sessions/:session_id/steps", proxyRequest, {
    params: SessionParams,
    body: PlanStepActionsBody,
  })
  .post("/v1/sessions/:session_id/statements", proxyRequest, {
    params: SessionParams,
    body: ExecuteStatementBody,
  })
  .post("/v1/sessions/:session_id/areas", proxyRequest, {
    params: SessionParams,
    body: ChooseAreaBody,
  })
  .post("/v1/sessions/:session_id/elements", proxyRequest, {
    params: SessionParams,
    body: FindElementBody,
  })
  .post("/v1/sessions/:session_id/examples", proxyRequest, {
    params: SessionParams,
    body: AddExampleBody,
  })
  .delete("/v1/sessions/:session_id/examples", proxyRequest, {
    params: SessionParams,
  })
  .post("/v1/sessions/:session_id/changes", proxyRequest, {
    params: SessionParams,
    body: AnalyzeChangesBody,
  })
  .post("/v1/sessions/:session_id/caches", proxyRequest, {
    params: SessionParams,
  })
  .delete("/v1/sessions/:session_id/caches", proxyRequest, {
    params: SessionParams,
  });

app.listen(PORT);

//#endregion

//#region Proxy

async function proxyRequest(context: Context): Promise<Response> {
  const { request, body } = context;
  const url = new URL(request.url);
  const targetUrl = `${LEGACY_BASE_URL}${url.pathname}${url.search}`;

  console.log(`Proxying ${request.method} ${url.pathname} -> ${targetUrl}`);

  try {
    const headers = new Headers(request.headers);
    const requestBody = body ? JSON.stringify(body) : null;

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: requestBody,
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

//#endregion
