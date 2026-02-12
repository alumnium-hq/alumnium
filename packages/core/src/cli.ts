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
    name: z.string(),
    description: z.string(),
    parameters: z.object({
      type: z.literal("object"),
      properties: z.record(z.any(), z.any()),
      required: z.array(z.string()).optional(),
    }),
  }),
});

const SessionRequestSchema = z.object({
  platform: z.enum(["chromium", "uiautomator2", "xcuitest"]),
  provider: z.string(),
  name: z.string().optional(),
  tools: z.array(ToolSchema),
});

const PlanRequestSchema = z.object({
  goal: z.string(),
  accessibility_tree: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
});

const StepRequestSchema = z.object({
  goal: z.string(),
  step: z.string(),
  accessibility_tree: z.string(),
});

const StatementRequestSchema = z.object({
  statement: z.string(),
  accessibility_tree: z.string(),
  url: z.string().optional(),
  title: z.string().optional(),
  screenshot: z.string().nullable().optional(),
});

const AreaRequestSchema = z.object({
  description: z.string(),
  accessibility_tree: z.string(),
});

const FindRequestSchema = z.object({
  description: z.string(),
  accessibility_tree: z.string(),
});

const AddExampleRequestSchema = z.object({
  goal: z.string(),
  actions: z.array(z.string()),
});

const ChangeStateSchema = z.object({
  accessibility_tree: z.string(),
  url: z.string(),
});

const ChangesRequestSchema = z.object({
  before: ChangeStateSchema,
  after: ChangeStateSchema,
});

//#endregion

//#region Routes

Bun.serve({
  port: PORT,
  routes: {
    "/health": {
      GET(req) {
        return proxyRequest(req, {});
      },
    },

    "/v1/sessions": {
      GET(req) {
        return proxyRequest(req, {});
      },

      POST(req) {
        return validateAndProxy(req, SessionRequestSchema, {});
      },
    },

    "/v1/sessions/:session_id": {
      DELETE(req) {
        return proxyRequest(req, req.params);
      },
    },

    "/v1/sessions/:session_id/stats": {
      GET(req) {
        return proxyRequest(req, req.params);
      },
    },

    "/v1/sessions/:session_id/plans": {
      POST(req) {
        return validateAndProxy(req, PlanRequestSchema, req.params);
      },
    },

    "/v1/sessions/:session_id/steps": {
      POST(req) {
        return validateAndProxy(req, StepRequestSchema, req.params);
      },
    },

    "/v1/sessions/:session_id/statements": {
      POST(req) {
        return validateAndProxy(req, StatementRequestSchema, req.params);
      },
    },

    "/v1/sessions/:session_id/areas": {
      POST(req) {
        return validateAndProxy(req, AreaRequestSchema, req.params);
      },
    },

    "/v1/sessions/:session_id/elements": {
      POST(req) {
        return validateAndProxy(req, FindRequestSchema, req.params);
      },
    },

    "/v1/sessions/:session_id/examples": {
      POST(req) {
        return validateAndProxy(req, AddExampleRequestSchema, req.params);
      },

      DELETE(req) {
        return proxyRequest(req, req.params);
      },
    },

    "/v1/sessions/:session_id/changes": {
      POST(req) {
        return validateAndProxy(req, ChangesRequestSchema, req.params);
      },
    },

    "/v1/sessions/:session_id/caches": {
      POST(req) {
        return proxyRequest(req, req.params);
      },

      DELETE(req) {
        return proxyRequest(req, req.params);
      },
    },
  },
});

//#endregion

//#region Proxy

async function proxyRequest(
  req: Request,
  _pathParams: Record<string, string>,
  targetMethod?: string,
): Promise<Response> {
  const url = new URL(req.url);
  const targetUrl = `${LEGACY_BASE_URL}${url.pathname}${url.search}`;

  console.log(`Proxying ${req.method} ${url.pathname} -> ${targetUrl}`);

  try {
    const headers = new Headers(req.headers);

    const response = await fetch(targetUrl, {
      method: targetMethod || req.method,
      headers: headers,
      body: req.body,
    });

    const body = await response.blob();

    return new Response(body, {
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

async function validateAndProxy(
  req: Request,
  schema: z.ZodSchema,
  params: Record<string, string>,
) {
  try {
    const clone = req.clone();
    const body = await clone.json();
    schema.parse(body);
  } catch (err) {
    console.warn(`Validation failed for ${req.method} ${req.url}`, err);
  }
  return proxyRequest(req, params);
}

//#endregion
