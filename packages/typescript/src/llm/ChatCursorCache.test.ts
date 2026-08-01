import type { ToolDefinition } from "@langchain/core/language_models/base";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import type { Generation } from "@langchain/core/outputs";
import { ChatCursor } from "langchain-cursor";
import { describe, expect, it, vi } from "vitest";
import { Lchain } from "./Lchain.ts";

const createMock = vi.fn();
const sendMock = vi.fn();

// NOTE: The mock reaches the dynamic import inside the package only because
// vitest inlines langchain-cursor (see vitest.config.ts).
vi.mock("@cursor/sdk", () => ({
  Agent: {
    create: (...args: unknown[]) => createMock(...args),
  },
  JsonlLocalAgentStore: class {
    rootDir: string;
    constructor(rootDir: string) {
      this.rootDir = rootDir;
    }
  },
}));

const CLICK_TOOL: ToolDefinition = {
  type: "function",
  function: {
    name: "click",
    description: "Click an element",
    parameters: {
      type: "object",
      properties: { id: { type: "number" } },
      required: ["id"],
    },
  },
};

describe("ChatCursor cache compatibility", () => {
  it("produces generations that round-trip the Lchain cache schema", async () => {
    const reply = '{"tool_calls": [{"name": "click", "arguments": {"id": 7}}]}';
    sendMock.mockResolvedValue({
      id: "run-1",
      agentId: "agent-1",
      wait: vi.fn().mockResolvedValue({
        id: "run-1",
        status: "finished",
        result: reply,
        usage: {
          inputTokens: 1,
          outputTokens: 2,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 3,
        },
      }),
      cancel: vi.fn(),
    });
    createMock.mockResolvedValue({
      agentId: "agent-1",
      send: sendMock,
      close: vi.fn(),
    });

    const llm = new ChatCursor({ model: "composer-2.5", apiKey: "key" });
    const message = await llm
      .bindTools([CLICK_TOOL])
      .invoke([
        new SystemMessage("You are a test agent."),
        new HumanMessage("Click the button."),
      ]);

    const generation: Generation = { text: reply, message } as never;
    expect(() => Lchain.toStored(generation)).not.toThrow();
    // The planner elements cache skips generations with empty content.
    expect(message.content).toBe(reply);
  });
});
