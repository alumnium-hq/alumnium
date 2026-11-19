import fs from "node:fs/promises";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";
import { Env } from "@alumnium/core/internal";
import { McpState } from "./McpState.ts";
import { startMcpTool } from "./tools/startMcpTool.ts";
import { stopMcpTool } from "./tools/stopMcpTool.ts";

const requestSchema = z.object({
  capabilities: z.object({ alwaysMatch: z.record(z.string(), z.unknown()) }),
});
const startResult = z.object({ id: z.string(), driver: z.string() });
let server: http.Server;
let directory: string;
let endpoint: string;
let failSettings: boolean;
let events: Array<{ method: string; path: string; body: unknown }>;

beforeEach(async () => {
  events = [];
  failSettings = false;
  directory = await fs.mkdtemp(path.join(os.tmpdir(), "appium-protocol-"));
  server = http.createServer((request, response) => {
    void handle(request, response);
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string")
    throw new Error("Expected a TCP server");
  endpoint = `http://127.0.0.1:${address.port}/wd/hub`;
  vi.stubEnv("LT_USERNAME", undefined);
  vi.stubEnv("LT_ACCESS_KEY", undefined);
  vi.stubEnv("ALUMNIUM_DRIVER", "appium-ios");
  vi.stubEnv("ALUMNIUM_MODEL", "openai/gpt-4o");
  vi.stubEnv("OPENAI_API_KEY", "unused-for-protocol-test");
  vi.stubEnv("ALUMNIUM_MCP_ARTIFACTS_DIR", directory);
  Env.reset();
  McpState.clear();
});

afterEach(async () => {
  await McpState.cleanupAllDrivers();
  McpState.clear();
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  await fs.rm(directory, { recursive: true, force: true });
  vi.unstubAllEnvs();
  Env.reset();
});

async function handle(
  request: http.IncomingMessage,
  response: http.ServerResponse,
) {
  try {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const raw = Buffer.concat(chunks).toString();
    const body: unknown = raw ? JSON.parse(raw) : null;
    const method = request.method ?? "";
    const requestPath = request.url ?? "";
    events.push({ method, path: requestPath, body });
    response.setHeader("Content-Type", "application/json");
    if (method === "POST" && requestPath === "/wd/hub/session") {
      const { capabilities } = requestSchema.parse(body);
      response.end(
        JSON.stringify({
          value: {
            sessionId: "remote-session",
            capabilities: { ...capabilities.alwaysMatch, platformName: "iOS" },
          },
        }),
      );
    } else if (failSettings && requestPath.endsWith("/appium/settings")) {
      response.statusCode = 400;
      response.end(
        JSON.stringify({
          value: {
            error: "invalid argument",
            message: "Remote settings rejected",
            stacktrace: "",
          },
        }),
      );
    } else if (
      (method === "DELETE" &&
        requestPath === "/wd/hub/session/remote-session") ||
      requestPath.endsWith("/appium/settings") ||
      requestPath.endsWith("/location")
    ) {
      response.end(JSON.stringify({ value: null }));
    } else {
      response.statusCode = 404;
      response.end(
        JSON.stringify({
          value: {
            error: "unknown command",
            message: requestPath,
            stacktrace: "",
          },
        }),
      );
    }
  } catch (error) {
    response.statusCode = 500;
    response.end(
      JSON.stringify({
        value: {
          error: "unknown error",
          message: String(error),
          stacktrace: "",
        },
      }),
    );
  }
}

function start() {
  return startMcpTool.execute({
    server_url: endpoint,
    capabilities: JSON.stringify({
      platformName: "ios",
      "appium:platformVersion": "26.5",
      "appium:settings": { snapshotMaxDepth: 20 },
      "alumnium:options": {
        deviceLifecycle: "create",
        device: "iPhone 18",
        app: "/server-only/Build.app",
        deviceLocation: { latitude: 37.7, longitude: -122.4 },
      },
    }),
  });
}

describe("Appium MCP protocol ownership", () => {
  it("requests server-side provisioning and sends a real DELETE session on stop", async () => {
    const output = await start();
    const result = startResult.parse(JSON.parse(output[0]!.text));
    expect(result.driver).toBe("appium");
    const request = requestSchema.parse(events[0]?.body);
    expect(request.capabilities.alwaysMatch).toMatchObject({
      "appium:enforceFreshSimulatorCreation": true,
      "appium:deviceName": "iPhone 18",
      "appium:platformVersion": "26.5",
      "appium:app": "/server-only/Build.app",
    });
    expect(events.some((event) => event.path.endsWith("/location"))).toBe(true);
    await stopMcpTool.execute({ id: result.id, save_cache: false });
    expect(events.filter((event) => event.method === "DELETE")).toEqual([
      { method: "DELETE", path: "/wd/hub/session/remote-session", body: null },
    ]);
  });

  it("sends DELETE session when the server rejects post-start settings", async () => {
    failSettings = true;
    await expect(start()).rejects.toThrow("Remote settings rejected");
    expect(events.at(-1)).toEqual({
      method: "DELETE",
      path: "/wd/hub/session/remote-session",
      body: null,
    });
    expect(events.filter((event) => event.method === "DELETE")).toHaveLength(1);
  });
});
