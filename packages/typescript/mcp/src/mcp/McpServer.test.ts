import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { McpServer as Server } from "@modelcontextprotocol/sdk/server/mcp.js";
import { afterEach, describe, expect, it, vi } from "vitest";
import { McpServer } from "./McpServer.ts";
import { checkMcpTool } from "./tools/checkMcpTool.ts";
import { doMcpTool } from "./tools/doMcpTool.ts";

let client: Client;

afterEach(async () => {
  await client?.close();
  vi.restoreAllMocks();
});

describe("required step labels", () => {
  it("advertises step as required only on do and check when enabled", async () => {
    await connect({ requireStep: true });
    const { tools } = await client.listTools();
    for (const tool of tools) {
      expect(tool.inputSchema.required?.includes("step") ?? false).toBe(
        tool.name === "do" || tool.name === "check",
      );
    }
  });

  it.each(["do", "check"])(
    "rejects invalid %s labels before execution and accepts corrected calls",
    async (name) => {
      const tool = name === "do" ? doMcpTool : checkMcpTool;
      const execute = vi.spyOn(tool, "execute").mockResolvedValue([]);
      await connect({ requireStep: true });
      const args = { id: "browser", goal: "Click", statement: "Visible" };
      for (const step of [undefined, null, "1", -1, 1.5, true]) {
        const result = await client.callTool({
          name,
          arguments: { ...args, ...(step === undefined ? {} : { step }) },
        });
        expect(result).toMatchObject({
          isError: true,
          content: [
            {
              type: "text",
              text: expect.stringContaining(
                `Input validation error: Invalid arguments for tool ${name}:`,
              ),
            },
          ],
        });
      }
      expect(execute).not.toHaveBeenCalled();
      for (const step of [0, 1, 2, 1]) {
        const result = await client.callTool({
          name,
          arguments: { ...args, step },
        });
        expect(result.isError).not.toBe(true);
      }
      expect(execute).toHaveBeenCalledTimes(4);
    },
  );

  it("keeps labels optional by default", async () => {
    const execute = vi.spyOn(doMcpTool, "execute").mockResolvedValue([]);
    await connect();
    const { tools } = await client.listTools();
    expect(
      tools.find((tool) => tool.name === "do")?.inputSchema.required,
    ).not.toContain("step");
    const result = await client.callTool({
      name: "do",
      arguments: { id: "browser", goal: "Click" },
    });
    expect(result.isError).not.toBe(true);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});

async function connect(options: McpServer.Props = {}) {
  const [clientTransport, serverTransport] =
    InMemoryTransport.createLinkedPair();
  const originalConnect = Server.prototype.connect;
  vi.spyOn(Server.prototype, "connect").mockImplementation(
    function (this: Server) {
      return originalConnect.call(this, serverTransport);
    },
  );
  await new McpServer(options).run();
  client = new Client({ name: "step-label-test", version: "1.0.0" });
  await client.connect(clientTransport);
}
