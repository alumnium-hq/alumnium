import type { ToolDefinition } from "@langchain/core/language_models/base";
import {
  AIMessage,
  HumanMessage,
  SystemMessage,
} from "@langchain/core/messages";
import type { Generation } from "@langchain/core/outputs";
import { beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";
import { pushMock } from "../../tests/unit/mocks.ts";
import { ChatCursor } from "./ChatCursor.ts";
import { Lchain } from "./Lchain.ts";

const createMock = vi.fn();
const sendMock = vi.fn();
const closeMock = vi.fn();
const cancelMock = vi.fn();

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

interface RunResultStub {
  id?: string;
  status?: string;
  result?: string;
  error?: { message: string; code?: string };
  usage?: Record<string, number>;
}

function stubRun(result: RunResultStub, waitOverride?: () => Promise<never>) {
  const runResult = { id: "run-1", status: "finished", ...result };
  return {
    id: runResult.id,
    agentId: "agent-1",
    wait: waitOverride
      ? vi.fn(waitOverride)
      : vi.fn().mockResolvedValue(runResult),
    cancel: cancelMock.mockResolvedValue(undefined),
  };
}

function stubAgent(...runs: ReturnType<typeof stubRun>[]) {
  for (const run of runs) sendMock.mockResolvedValueOnce(run);
  createMock.mockResolvedValue({
    agentId: "agent-1",
    send: sendMock,
    close: closeMock,
  });
}

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

const MESSAGES = [
  new SystemMessage("You are a test agent."),
  new HumanMessage("Do the thing."),
];

beforeEach(() => {
  pushMock(createMock, sendMock, closeMock, cancelMock);
});

describe("ChatCursor._generate", () => {
  it("returns the run result text with usage and id", async () => {
    stubAgent(
      stubRun({
        id: "run-42",
        result: "The answer",
        usage: {
          inputTokens: 10,
          outputTokens: 5,
          cacheReadTokens: 2,
          cacheWriteTokens: 1,
          totalTokens: 15,
        },
      }),
    );

    const llm = new ChatCursor({ model: "composer-2.5", apiKey: "key" });
    const message = await llm.invoke(MESSAGES);

    expect(message.content).toBe("The answer");
    expect(message.id).toBe("run-42");
    expect(message.usage_metadata).toEqual({
      input_tokens: 10,
      output_tokens: 5,
      total_tokens: 15,
      input_token_details: { cache_read: 2, cache_creation: 1 },
    });
    expect(closeMock).toHaveBeenCalled();
  });

  it("creates a sandboxed local agent without user settings", async () => {
    stubAgent(stubRun({ result: "ok" }));

    const llm = new ChatCursor({ model: "composer-2.5", apiKey: "key" });
    await llm.invoke(MESSAGES);

    expect(createMock).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "key",
        model: { id: "composer-2.5" },
        local: expect.objectContaining({
          settingSources: [],
          sandboxOptions: { enabled: true },
        }),
      }),
    );
  });

  it("sends role-tagged prompt text with guardrails", async () => {
    stubAgent(stubRun({ result: "ok" }));

    const llm = new ChatCursor({ model: "composer-2.5" });
    await llm.invoke(MESSAGES);

    const payload = sendMock.mock.calls[0]?.[0];
    expect(payload.text).toContain(
      "<system>\nYou are a test agent.\n</system>",
    );
    expect(payload.text).toContain("<user>\nDo the thing.\n</user>");
    expect(payload.text).toContain("# Execution context");
  });

  it("forwards data-URL images to the agent", async () => {
    stubAgent(stubRun({ result: "ok" }));

    const llm = new ChatCursor({ model: "composer-2.5" });
    await llm.invoke([
      new HumanMessage({
        content: [
          { type: "text", text: "Describe" },
          {
            type: "image_url",
            image_url: { url: "data:image/png;base64,aGVsbG8=" },
          },
        ],
      }),
    ]);

    const payload = sendMock.mock.calls[0]?.[0];
    expect(payload.images).toEqual([
      { data: "aGVsbG8=", mimeType: "image/png" },
    ]);
  });

  it("closes the agent when the run fails", async () => {
    stubAgent(stubRun({ status: "error", error: { message: "boom" } }));

    const llm = new ChatCursor({ model: "composer-2.5" });
    await expect(llm.invoke(MESSAGES)).rejects.toThrow(/boom/);
    expect(closeMock).toHaveBeenCalled();
  });

  it("produces generations that round-trip the cache schema", async () => {
    stubAgent(
      stubRun({
        result: "cached text",
        usage: {
          inputTokens: 1,
          outputTokens: 2,
          cacheReadTokens: 0,
          cacheWriteTokens: 0,
          totalTokens: 3,
        },
      }),
    );

    const llm = new ChatCursor({ model: "composer-2.5" });
    const message = await llm.invoke(MESSAGES);

    const generation: Generation = { text: "cached text", message } as never;
    expect(() => Lchain.toStored(generation)).not.toThrow();
  });
});

describe("ChatCursor tool calling", () => {
  it("parses tool calls from the JSON reply", async () => {
    stubAgent(
      stubRun({
        result: '{"tool_calls": [{"name": "click", "arguments": {"id": 7}}]}',
      }),
    );

    const llm = new ChatCursor({ model: "composer-2.5" });
    const message = (await llm
      .bindTools([CLICK_TOOL])
      .invoke(MESSAGES)) as AIMessage;

    expect(message.tool_calls).toHaveLength(1);
    expect(message.tool_calls?.[0]).toMatchObject({
      name: "click",
      args: { id: 7 },
      type: "tool_call",
    });
    expect(message.tool_calls?.[0]?.id).toMatch(/^call_/);
    // The raw reply stays in content: the planner elements cache skips
    // generations with empty content.
    expect(message.content).toBe(
      '{"tool_calls": [{"name": "click", "arguments": {"id": 7}}]}',
    );
  });

  it("embeds the tool contract in the prompt", async () => {
    stubAgent(stubRun({ result: '{"tool_calls": []}' }));

    const llm = new ChatCursor({ model: "composer-2.5" });
    await llm.bindTools([CLICK_TOOL]).invoke(MESSAGES);

    const payload = sendMock.mock.calls[0]?.[0];
    expect(payload.text).toContain("# Tool calling");
    expect(payload.text).toContain('"click"');
  });

  it("re-asks once when the reply is not valid tool call JSON", async () => {
    stubAgent(
      stubRun({ result: "I clicked it for you!" }),
      stubRun({
        result: '{"tool_calls": [{"name": "click", "arguments": {"id": 1}}]}',
      }),
    );

    const llm = new ChatCursor({ model: "composer-2.5" });
    const message = (await llm
      .bindTools([CLICK_TOOL])
      .invoke(MESSAGES)) as AIMessage;

    expect(sendMock).toHaveBeenCalledTimes(2);
    expect(sendMock.mock.calls[1]?.[0].text).toMatch(/only.*json/i);
    expect(message.tool_calls?.[0]).toMatchObject({
      name: "click",
      args: { id: 1 },
    });
    expect(message.content).toBe(
      '{"tool_calls": [{"name": "click", "arguments": {"id": 1}}]}',
    );
  });

  it("throws when the corrective re-ask also fails", async () => {
    stubAgent(stubRun({ result: "prose" }), stubRun({ result: "more prose" }));

    const llm = new ChatCursor({ model: "composer-2.5" });
    await expect(llm.bindTools([CLICK_TOOL]).invoke(MESSAGES)).rejects.toThrow(
      /JSON/,
    );
    expect(closeMock).toHaveBeenCalled();
  });
});

describe("ChatCursor sandbox fallback", () => {
  function sandboxUnsupportedError() {
    const error = new Error(
      "Local SDK sandboxing was requested, but sandboxing is not supported " +
        "in this environment. Disable local.sandboxOptions.enabled or remove " +
        "~/.cursor/sandbox.json to run without sandboxing.",
    );
    error.name = "ConfigurationError";
    return error;
  }

  it("retries without sandboxing when the environment does not support it", async () => {
    sendMock.mockRejectedValueOnce(sandboxUnsupportedError());
    sendMock.mockResolvedValueOnce(stubRun({ result: "recovered" }));
    createMock.mockResolvedValue({
      agentId: "agent-1",
      send: sendMock,
      close: closeMock,
    });

    const llm = new ChatCursor({ model: "composer-2.5" });
    const message = await llm.invoke(MESSAGES);

    expect(message.content).toBe("recovered");
    expect(createMock).toHaveBeenCalledTimes(2);
    expect(createMock.mock.calls[0]?.[0].local.sandboxOptions).toEqual({
      enabled: true,
    });
    expect(createMock.mock.calls[1]?.[0].local.sandboxOptions).toEqual({
      enabled: false,
    });
  });

  it("skips sandboxing on subsequent calls once unsupported", async () => {
    sendMock.mockRejectedValueOnce(sandboxUnsupportedError());
    sendMock.mockResolvedValueOnce(stubRun({ result: "first" }));
    sendMock.mockResolvedValueOnce(stubRun({ result: "second" }));
    createMock.mockResolvedValue({
      agentId: "agent-1",
      send: sendMock,
      close: closeMock,
    });

    const llm = new ChatCursor({ model: "composer-2.5" });
    await llm.invoke(MESSAGES);
    await llm.invoke(MESSAGES);

    expect(createMock).toHaveBeenCalledTimes(3);
    expect(createMock.mock.calls[2]?.[0].local.sandboxOptions).toEqual({
      enabled: false,
    });
  });

  it("propagates unrelated configuration errors", async () => {
    const error = new Error("Invalid model name");
    error.name = "ConfigurationError";
    sendMock.mockRejectedValueOnce(error);
    createMock.mockResolvedValue({
      agentId: "agent-1",
      send: sendMock,
      close: closeMock,
    });

    const llm = new ChatCursor({ model: "composer-2.5" });
    await expect(llm.invoke(MESSAGES)).rejects.toThrow(/Invalid model name/);
    expect(createMock).toHaveBeenCalledTimes(1);
  });
});

describe("ChatCursor error mapping", () => {
  it("preserves SDK rate limit errors for the retry wrapper", async () => {
    const rateLimitError = new Error("slow down");
    rateLimitError.name = "RateLimitError";
    sendMock.mockRejectedValueOnce(rateLimitError);
    createMock.mockResolvedValue({
      agentId: "agent-1",
      send: sendMock,
      close: closeMock,
    });

    const llm = new ChatCursor({ model: "composer-2.5" });
    await expect(llm.invoke(MESSAGES)).rejects.toMatchObject({
      name: "RateLimitError",
    });
  });

  it("maps retryable SDK errors to TimeoutError", async () => {
    const networkError = Object.assign(new Error("service unavailable"), {
      name: "NetworkError",
      isRetryable: true,
    });
    sendMock.mockRejectedValueOnce(networkError);
    createMock.mockResolvedValue({
      agentId: "agent-1",
      send: sendMock,
      close: closeMock,
    });

    const llm = new ChatCursor({ model: "composer-2.5" });
    await expect(llm.invoke(MESSAGES)).rejects.toMatchObject({
      name: "TimeoutError",
    });
  });

  it("aborts a hung run with a TimeoutError and cancels it", async () => {
    stubAgent(stubRun({}, () => new Promise<never>(() => {})));

    const llm = new ChatCursor({ model: "composer-2.5" });
    await expect(llm.invoke(MESSAGES, { timeout: 25 })).rejects.toMatchObject({
      name: "TimeoutError",
    });
    expect(cancelMock).toHaveBeenCalled();
    expect(closeMock).toHaveBeenCalled();
  });
});

describe("ChatCursor.withStructuredOutput", () => {
  const Plan = z.object({
    explanation: z.string(),
    actions: z.array(z.string()),
  });

  it("returns raw and parsed output from a live call", async () => {
    stubAgent(
      stubRun({
        result:
          '{"tool_calls": [{"name": "extract", "arguments": {"explanation": "why", "actions": ["a", "b"]}}]}',
      }),
    );

    const llm = new ChatCursor({ model: "composer-2.5" });
    const result = (await llm
      .withStructuredOutput(Plan, { includeRaw: true })
      .invoke(MESSAGES)) as { raw: AIMessage; parsed: z.infer<typeof Plan> };

    expect(result.parsed).toEqual({ explanation: "why", actions: ["a", "b"] });
    expect(result.raw.tool_calls?.[0]?.name).toBe("extract");
  });

  it("parses plain AIMessages from cache hits", async () => {
    const cachedMessage = new AIMessage({
      id: "cached-1",
      content: "",
      tool_calls: [
        {
          type: "tool_call",
          id: "call_cached",
          name: "extract",
          args: { explanation: "cached", actions: ["x"] },
        },
      ],
    });
    const cache = {
      lookup: vi.fn().mockResolvedValue([{ text: "", message: cachedMessage }]),
      update: vi.fn(),
    };

    const llm = new ChatCursor({
      model: "composer-2.5",
      cache: cache as never,
    });
    const result = (await llm
      .withStructuredOutput(Plan, { includeRaw: true })
      .invoke(MESSAGES)) as { raw: AIMessage; parsed: z.infer<typeof Plan> };

    expect(createMock).not.toHaveBeenCalled();
    expect(result.parsed).toEqual({ explanation: "cached", actions: ["x"] });
  });
});
