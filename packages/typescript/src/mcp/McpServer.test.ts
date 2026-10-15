import { spawn, type ChildProcess } from "node:child_process";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { afterAll, describe, expect, it } from "vitest";
import { sleep } from "../utils/timers.ts";
import type { McpMode } from "./McpMode.ts";

const fixture = fileURLToPath(
  new URL("../../tests/unit/fixtures/mcpHttpServer.ts", import.meta.url),
);
const children: ChildProcess[] = [];

afterAll(() => children.forEach((child) => child.kill()));

function freePort(): Promise<number> {
  return new Promise((resolve) => {
    const probe = createServer().listen(0, () => {
      const address = probe.address();
      if (address === null || typeof address === "string") {
        throw new Error("unexpected server address");
      }
      probe.close(() => resolve(address.port));
    });
  });
}

// MCP HTTP transport is served by Bun.serve; unit tests run under Node, so the
// server runs as a Bun subprocess.
async function startServer(mode: McpMode): Promise<string> {
  const port = await freePort();
  children.push(spawn("bun", [fixture, mode, String(port)]));
  const endpoint = `http://127.0.0.1:${port}/mcp`;
  for (let attempt = 0; attempt < 100; attempt += 1) {
    try {
      await fetch(endpoint, { method: "POST" });
      return endpoint;
    } catch {
      await sleep(100);
    }
  }
  throw new Error(`server did not start on ${endpoint}`);
}

async function listTools(endpoint: string): Promise<Response> {
  return fetch(endpoint, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
  });
}

async function toolNames(response: Response): Promise<string[]> {
  const body = (await response.json()) as {
    result: { tools: { name: string }[] };
  };
  return body.result.tools.map((tool) => tool.name);
}

describe("McpServer HTTP mode selection", () => {
  it("uses the server default mode without ?mode=", async () => {
    const endpoint = await startServer("agentic");
    const response = await listTools(endpoint);
    const names = await toolNames(response);
    expect(names).toContain("do");
    expect(names).not.toContain("click");
  });

  it("overrides an agentic server to direct with ?mode=direct", async () => {
    const endpoint = await startServer("agentic");
    const response = await listTools(`${endpoint}?mode=direct`);
    const names = await toolNames(response);
    expect(names).toContain("click");
    expect(names).not.toContain("do");
  });

  it("overrides a direct server to agentic with ?mode=agentic", async () => {
    const endpoint = await startServer("direct");
    const response = await listTools(`${endpoint}?mode=agentic`);
    const names = await toolNames(response);
    expect(names).toContain("do");
  });

  it("rejects an unknown ?mode with 400", async () => {
    const endpoint = await startServer("agentic");
    const response = await listTools(`${endpoint}?mode=bogus`);
    expect(response.status).toBe(400);
  });
});
