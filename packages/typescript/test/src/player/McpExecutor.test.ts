import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it } from "vitest";
import z from "zod";
import { McpExecutor } from "./McpExecutor.ts";
import { composeExecutors, type ToolExecutor } from "./ToolExecutor.ts";

const clients: Client[] = [];

afterEach(async () => {
  await Promise.all(clients.splice(0).map((client) => client.close()));
});

/** Client of an in-process server whose `echo` tool fails `failures` times. */
async function connectServer(failures = 0) {
  const server = new McpServer({ name: "test", version: "1.0.0" });
  const metas: unknown[] = [];

  server.registerTool(
    "echo",
    { inputSchema: { value: z.string() } },
    async ({ value }, { _meta }) => {
      metas.push(_meta);
      if (failures-- > 0)
        return { content: [{ type: "text", text: "Busy" }], isError: true };
      return { content: [{ type: "text", text: JSON.stringify({ value }) }] };
    },
  );

  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  const client = new Client({ name: "test", version: "1.0.0" });
  await client.connect(clientTransport);
  clients.push(client);

  return { client, metas };
}

const ECHO: ToolExecutor.Call = {
  server: "test",
  tool: "echo",
  input: { value: "a1" },
};

describe("McpExecutor", () => {
  it("handles the tools of its servers only", async () => {
    const { client } = await connectServer();
    const executor = new McpExecutor({
      servers: { test: { type: "client", client } },
    });

    expect(executor.handles(ECHO)).toBe(true);
    expect(executor.handles({ ...ECHO, server: "other" })).toBe(false);
    expect(executor.handles({ tool: "Bash", input: {} })).toBe(false);
  });

  it("calls a tool with the request meta", async () => {
    const { client, metas } = await connectServer();
    const executor = new McpExecutor({
      servers: { test: { type: "client", client } },
    });

    const result = await executor.execute(ECHO, {
      meta: { "alumnium.ai/cache": false },
    });

    expect(result).toEqual({
      content: [{ type: "text", text: '{"value":"a1"}' }],
      isError: false,
    });
    expect(metas).toEqual([{ "alumnium.ai/cache": false }]);
  });

  it("retries a call that reports an error", async () => {
    const { client, metas } = await connectServer(2);
    const executor = new McpExecutor({
      servers: { test: { type: "client", client } },
      retryDelayMs: 1,
    });

    const result = await executor.execute(ECHO);

    expect(result.isError).toBe(false);
    expect(metas).toHaveLength(3);
  });

  it("returns the error once out of retries", async () => {
    const { client, metas } = await connectServer(5);
    const executor = new McpExecutor({
      servers: { test: { type: "client", client } },
      retries: 1,
      retryDelayMs: 1,
    });

    const result = await executor.execute(ECHO);

    expect(result).toEqual({
      content: [{ type: "text", text: "Busy" }],
      isError: true,
    });
    expect(metas).toHaveLength(2);
  });
});

describe("composeExecutors", () => {
  it("executes a call with the first executor handling it", async () => {
    const { client } = await connectServer();
    const fallback: ToolExecutor = {
      handles: () => true,
      execute: async () => ({ content: "fallback", isError: false }),
    };
    const executor = composeExecutors(
      new McpExecutor({ servers: { test: { type: "client", client } } }),
      fallback,
    );

    expect((await executor.execute(ECHO)).content).not.toBe("fallback");
    expect((await executor.execute({ tool: "Bash", input: {} })).content).toBe(
      "fallback",
    );
  });

  it("throws for a call no executor handles", async () => {
    const executor = composeExecutors();

    expect(executor.handles(ECHO)).toBe(false);
    await expect(executor.execute(ECHO)).rejects.toThrow(
      "No executor handles tool 'test/echo'",
    );
  });
});
