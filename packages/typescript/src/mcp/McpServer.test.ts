import { describe, expect, it } from "bun:test";
import { McpServer } from "./McpServer.ts";
import type { McpMode } from "./McpMode.ts";

function freePort(): number {
  const probe = Bun.serve({ port: 0, fetch: () => new Response() });
  const { port } = probe;
  probe.stop();
  return port!;
}

function startServer(mode: McpMode): string {
  const port = freePort();
  void new McpServer({ transport: "http", port, mode }).run();
  return `http://127.0.0.1:${port}/mcp`;
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
    const endpoint = startServer("agentic");
    const response = await listTools(endpoint);
    const names = await toolNames(response);
    expect(names).toContain("do");
    expect(names).not.toContain("click");
  });

  it("overrides an agentic server to direct with ?mode=direct", async () => {
    const endpoint = startServer("agentic");
    const response = await listTools(`${endpoint}?mode=direct`);
    const names = await toolNames(response);
    expect(names).toContain("click");
    expect(names).not.toContain("do");
  });

  it("overrides a direct server to agentic with ?mode=agentic", async () => {
    const endpoint = startServer("direct");
    const response = await listTools(`${endpoint}?mode=agentic`);
    const names = await toolNames(response);
    expect(names).toContain("do");
  });

  it("rejects an unknown ?mode with 400", async () => {
    const endpoint = startServer("agentic");
    const response = await listTools(`${endpoint}?mode=bogus`);
    expect(response.status).toBe(400);
  });
});
