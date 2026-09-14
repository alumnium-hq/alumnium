import {
  APICallError,
  type LanguageModelV4CallOptions,
} from "@ai-sdk/provider";
import type { AgentOptions, RunResult, SDKUserMessage } from "@cursor/sdk";
import { generateText, Output, streamText, tool } from "ai";
import fs from "node:fs/promises";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { Env } from "../Env.ts";
import { Model } from "../Model.ts";
import { LlmFactory } from "../server/LlmFactory.ts";
import { CursorLanguageModel } from "./CursorLanguageModel.ts";

const mocks = vi.hoisted(() => ({
  create: vi.fn<(options: AgentOptions) => Promise<unknown>>(),
  send: vi.fn<(payload: SDKUserMessage) => Promise<unknown>>(),
  wait: vi.fn<() => Promise<RunResult>>(),
  cancel: vi.fn(async () => {}),
  close: vi.fn(),
}));

vi.mock("@cursor/sdk", () => ({
  Agent: { create: mocks.create },
  JsonlLocalAgentStore: class {},
}));

const OPTIONS: LanguageModelV4CallOptions = {
  prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
};
const TOOLS: LanguageModelV4CallOptions["tools"] = [
  {
    type: "function",
    name: "click",
    inputSchema: { type: "object" },
  },
];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.create.mockResolvedValue({ send: mocks.send, close: mocks.close });
  mocks.send.mockResolvedValue({ wait: mocks.wait, cancel: mocks.cancel });
  mocks.cancel.mockResolvedValue();
  mocks.wait.mockResolvedValue({
    id: "run-1",
    status: "finished",
    result: "hello",
  });
});

afterEach(() => {
  vi.unstubAllEnvs();
  Env.reset();
});

function model() {
  return new CursorLanguageModel({ modelId: "composer-2.5" });
}

describe("CursorLanguageModel", () => {
  it("uses the factory's model and API key with a disposable local workspace", async () => {
    vi.stubEnv("CURSOR_API_KEY", "cursor-test-key");
    Env.reset();
    const result = await generateText({
      model: LlmFactory.createLlm(Model.parse("cursor")),
      prompt: "hello",
    });
    expect(result.text).toBe("hello");
    expect(mocks.create).toHaveBeenCalledWith(
      expect.objectContaining({
        apiKey: "cursor-test-key",
        model: { id: "composer-2.5" },
        local: expect.objectContaining({
          settingSources: [],
          sandboxOptions: { enabled: true },
        }),
      }),
    );
    expect(mocks.close).toHaveBeenCalledOnce();
    const cwd = mocks.create.mock.calls[0]![0].local!.cwd!;
    await expect(fs.access(path.dirname(cwd))).rejects.toThrow();
  });

  it("serializes history, tool results and screenshots", async () => {
    await model().doGenerate({
      prompt: [
        { role: "system", content: "system instructions" },
        {
          role: "user",
          content: [
            { type: "text", text: "look" },
            {
              type: "file",
              mediaType: "image/png",
              data: { type: "data", data: new Uint8Array([1, 2, 3]) },
            },
          ],
        },
        {
          role: "assistant",
          content: [
            {
              type: "tool-call",
              toolCallId: "call-1",
              toolName: "click",
              input: { id: 42 },
            },
          ],
        },
        {
          role: "tool",
          content: [
            {
              type: "tool-result",
              toolCallId: "call-1",
              toolName: "click",
              output: { type: "text", value: "clicked" },
            },
          ],
        },
      ],
    });
    const payload = mocks.send.mock.calls[0]![0];
    expect(payload.images).toEqual([{ mimeType: "image/png", data: "AQID" }]);
    expect(payload.text).toContain("<system>\nsystem instructions\n</system>");
    expect(payload.text).toContain("[image 1 attached]");
    expect(payload.text).toContain('"tool_call_id":"call-1"');
    expect(payload.text).toContain('"value":"clicked"');
    expect(payload.text).toContain("Do NOT read or write files");
  });

  it("returns AI SDK tool calls and handles fenced JSON with braces in strings", async () => {
    mocks.wait.mockResolvedValue({
      id: "run",
      status: "finished",
      result:
        '```json\n{"tool_calls":[{"name":"click","arguments":{"label":"a } brace"}},{"name":"click","args":{"label":"next"}}]}\n```',
    });
    const result = await generateText({
      model: model(),
      prompt: "click twice",
      tools: {
        click: tool({ inputSchema: z.object({ label: z.string() }) }),
      },
    });
    expect(result.toolCalls.map((call) => call.input)).toEqual([
      { label: "a } brace" },
      { label: "next" },
    ]);
    expect(result.toolCalls[0]!.toolCallId).not.toBe(
      result.toolCalls[1]!.toolCallId,
    );
    expect(result.finishReason).toBe("tool-calls");
  });

  it("repairs invalid tool replies once and sums usage", async () => {
    const usage = {
      inputTokens: 10,
      outputTokens: 4,
      totalTokens: 17,
      cacheReadTokens: 2,
      cacheWriteTokens: 1,
      reasoningTokens: 1,
    };
    mocks.wait.mockResolvedValueOnce({
      id: "first",
      status: "finished",
      result: "invalid",
      usage,
    });
    mocks.wait.mockResolvedValueOnce({
      id: "second",
      status: "finished",
      result: '{"tool_calls":[{"name":"click","arguments":{}}]}',
      usage,
    });
    const result = await model().doGenerate({ ...OPTIONS, tools: TOOLS });
    expect(mocks.send).toHaveBeenCalledTimes(2);
    expect(mocks.send.mock.calls[1]![0].text).toContain(
      "Your previous reply was invalid",
    );
    expect(result.usage).toEqual({
      inputTokens: {
        total: 26,
        noCache: 20,
        cacheRead: 4,
        cacheWrite: 2,
      },
      outputTokens: { total: 8, text: undefined, reasoning: 2 },
    });
  });

  it.each([
    ['{"tool_calls":[]}', { type: "required" }],
    ['{"tool_calls":[{"name":"other"}]}', { type: "tool", toolName: "click" }],
  ] as const)(
    "rejects invalid forced tool calls: %s",
    async (reply, toolChoice) => {
      mocks.wait.mockResolvedValue({
        id: "run",
        status: "finished",
        result: reply,
      });
      await expect(
        model().doGenerate({ ...OPTIONS, tools: TOOLS, toolChoice }),
      ).rejects.toThrow();
      expect(mocks.send).toHaveBeenCalledTimes(2);
      expect(mocks.close).toHaveBeenCalledOnce();
    },
  );

  it("honors toolChoice none", async () => {
    const result = await model().doGenerate({
      ...OPTIONS,
      tools: TOOLS,
      toolChoice: { type: "none" },
    });
    expect(result.content).toEqual([{ type: "text", text: "hello" }]);
    expect(mocks.send.mock.calls[0]![0].text).not.toContain("# Tool calling");
  });

  it("supports AI SDK structured output and repairs malformed JSON", async () => {
    mocks.wait.mockResolvedValueOnce({
      id: "run",
      status: "finished",
      result: "not JSON",
    });
    mocks.wait.mockResolvedValueOnce({
      id: "retry",
      status: "finished",
      result: '```json\n{"answer":42}\n```',
    });
    const result = await generateText({
      model: model(),
      prompt: "answer",
      output: Output.object({ schema: z.object({ answer: z.number() }) }),
    });
    expect(result.output).toEqual({ answer: 42 });
    expect(result.finishReason).toBe("stop");
    expect(mocks.send.mock.calls[0]![0].text).toContain("JSON schema:");
  });

  it("exposes buffered text and tool-call streams to AI SDK", async () => {
    expect(await streamText({ model: model(), prompt: "hello" }).text).toBe(
      "hello",
    );
    mocks.wait.mockResolvedValue({
      id: "run",
      status: "finished",
      result: '{"tool_calls":[{"name":"click","arguments":{"id":42}}]}',
    });
    const result = streamText({
      model: model(),
      prompt: "click",
      tools: { click: tool({ inputSchema: z.object({ id: z.number() }) }) },
    });
    expect((await result.toolCalls)[0]!.input).toEqual({ id: 42 });
    expect(await result.finishReason).toBe("tool-calls");
  });

  it("cancels an active run on abort and cleans up", async () => {
    const controller = new AbortController();
    mocks.wait.mockImplementation(() => {
      controller.abort(new Error("cancelled by caller"));
      return new Promise(() => {});
    });
    await expect(
      model().doGenerate({ ...OPTIONS, abortSignal: controller.signal }),
    ).rejects.toThrow("cancelled by caller");
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    await expect(
      fs.access(path.dirname(mocks.create.mock.calls[0]![0].local!.cwd!)),
    ).rejects.toThrow();
  });

  it("keeps timeout cancellation active across SDK operations", async () => {
    const signal = AbortSignal.timeout(100);
    const remove = vi.spyOn(signal, "removeEventListener");
    mocks.wait.mockImplementation(() => {
      expect(remove).not.toHaveBeenCalled();
      return new Promise(() => {});
    });
    await expect(
      model().doGenerate({ ...OPTIONS, abortSignal: signal }),
    ).rejects.toThrow();
    expect(signal.aborted).toBe(true);
    expect(mocks.cancel).toHaveBeenCalledOnce();
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
  });

  it("leaves unavailable token counts undefined", async () => {
    const unknown = await model().doGenerate(OPTIONS);
    expect(unknown.usage.inputTokens.total).toBeUndefined();
    expect(unknown.usage.outputTokens.reasoning).toBeUndefined();
    mocks.wait.mockResolvedValue({
      id: "run",
      status: "finished",
      result: "hello",
      usage: {
        inputTokens: 10,
        outputTokens: 4,
        cacheReadTokens: 2,
        cacheWriteTokens: 1,
        totalTokens: 17,
      },
    });
    const known = await model().doGenerate(OPTIONS);
    expect(known.usage.inputTokens).toEqual({
      total: 13,
      noCache: 10,
      cacheRead: 2,
      cacheWrite: 1,
    });
    expect(known.usage.outputTokens.reasoning).toBeUndefined();
  });

  it("does not start an agent for an already-aborted request", async () => {
    await expect(
      model().doGenerate({
        ...OPTIONS,
        abortSignal: AbortSignal.abort(new Error("already aborted")),
      }),
    ).rejects.toThrow("already aborted");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("closes an agent that finishes creating after cancellation", async () => {
    const controller = new AbortController();
    const pending = Promise.withResolvers<unknown>();
    mocks.create.mockImplementation(() => {
      controller.abort(new Error("cancel creation"));
      return pending.promise;
    });
    await expect(
      model().doGenerate({ ...OPTIONS, abortSignal: controller.signal }),
    ).rejects.toThrow("cancel creation");
    pending.resolve({ send: mocks.send, close: mocks.close });
    await pending.promise;
    expect(mocks.close).toHaveBeenCalledOnce();
    expect(mocks.send).not.toHaveBeenCalled();
  });

  it("retries without sandbox only when sandboxing is unsupported", async () => {
    mocks.create.mockRejectedValueOnce(
      Object.assign(new Error("sandbox unsupported"), {
        name: "ConfigurationError",
      }),
    );
    const llm = model();
    await llm.doGenerate(OPTIONS);
    await llm.doGenerate(OPTIONS);
    expect(
      mocks.create.mock.calls.map(
        ([options]) => options.local!.sandboxOptions!.enabled,
      ),
    ).toEqual([true, false, false]);
  });

  it("maps retryable SDK errors for AI SDK retries", async () => {
    mocks.send.mockRejectedValueOnce(
      Object.assign(new Error("rate limited"), { name: "RateLimitError" }),
    );
    await expect(model().doGenerate(OPTIONS)).rejects.toMatchObject({
      name: "AI_APICallError",
      isRetryable: true,
    });
    expect(mocks.close).toHaveBeenCalledOnce();
    mocks.send.mockRejectedValueOnce(new Error("authentication failed"));
    await expect(model().doGenerate(OPTIONS)).rejects.not.toBeInstanceOf(
      APICallError,
    );
  });

  it("surfaces failed runs and still closes the agent", async () => {
    mocks.wait.mockResolvedValue({
      id: "run",
      status: "error",
      error: { message: "failed" },
    });
    await expect(model().doGenerate(OPTIONS)).rejects.toThrow(
      "Cursor agent run error: failed",
    );
    expect(mocks.close).toHaveBeenCalledOnce();
  });
});
