import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import { generateText, Output } from "ai";
import type { RunningOpenAIOAuthServer } from "openai-oauth";
import { describe, expect, it, vi } from "vitest";
import z from "zod";
import { CodexLanguageModel } from "./CodexLanguageModel.ts";

const OPTIONS: LanguageModelV4CallOptions = {
  prompt: [{ role: "user", content: [{ type: "text", text: "hello" }] }],
};

describe("CodexLanguageModel", () => {
  it("starts one lazy proxy and delegates concurrent calls", async () => {
    const { model, delegate, startServer, createDelegate } = createModel();

    await Promise.all([model.doGenerate(OPTIONS), model.doGenerate(OPTIONS)]);

    expect(startServer).toHaveBeenCalledOnce();
    expect(createDelegate).toHaveBeenCalledWith(
      "http://127.0.0.1:1234/v1",
      "gpt-test",
    );
    expect(delegate.doGenerate).toHaveBeenCalledTimes(2);
  });

  it("closes the proxy", async () => {
    const { model, close } = createModel();
    await model.doGenerate(OPTIONS);

    await model.close();

    expect(close).toHaveBeenCalledOnce();
  });

  it("translates structured output to a forced tool and back to text", async () => {
    const { model, delegate } = createModel({
      content: [
        {
          type: "tool-call",
          toolCallId: "call-1",
          toolName: "__alumnium_structured_output",
          input: '{"answer":42}',
        },
      ],
      finishReason: { unified: "tool-calls", raw: "tool_calls" },
    });

    const result = await model.doGenerate({
      ...OPTIONS,
      responseFormat: {
        type: "json",
        schema: { type: "object", properties: { answer: { type: "number" } } },
      },
    });

    expect(delegate.doGenerate).toHaveBeenCalledWith(
      expect.objectContaining({
        responseFormat: { type: "text" },
        toolChoice: {
          type: "tool",
          toolName: "__alumnium_structured_output",
        },
      }),
    );
    expect(result.content).toEqual([{ type: "text", text: '{"answer":42}' }]);
    expect(result.finishReason.unified).toBe("stop");
  });

  it("parses structured text returned with an ambiguous finish reason", async () => {
    const { model } = createModel({
      content: [{ type: "text", text: '{"answer":42}' }],
      finishReason: { unified: "other", raw: undefined },
    });

    const result = await generateText({
      model,
      prompt: "answer the question",
      output: Output.object({
        schema: z.object({ answer: z.number() }),
      }),
    });

    expect(result.output).toEqual({ answer: 42 });
    expect(result.finishReason).toBe("stop");
  });

  it("preserves normal tool calls", async () => {
    const toolCall = {
      type: "tool-call" as const,
      toolCallId: "call-1",
      toolName: "click",
      input: '{"id":1}',
    };
    const { model } = createModel({ content: [toolCall] });

    expect((await model.doGenerate(OPTIONS)).content).toEqual([toolCall]);
  });

  it("rejects inline images when uploading is disabled", async () => {
    const { model } = createModel({}, { litterboxUpload: false });

    await expect(model.doGenerate(imageOptions())).rejects.toThrow(
      "Codex models do not support inline images",
    );
  });

  it("uploads and caches inline images when enabled", async () => {
    const fetch = vi.fn(
      async () => new Response("https://example.test/image.png"),
    );
    const { model, doGenerate } = createModel(
      {},
      { litterboxUpload: true, fetch },
    );

    await model.doGenerate(imageOptions());
    await model.doGenerate(imageOptions());

    expect(fetch).toHaveBeenCalledOnce();
    const delegated = doGenerate.mock.calls[0]?.[0];
    expect(delegated?.prompt[0]).toEqual({
      role: "user",
      content: [
        {
          type: "file",
          mediaType: "image/png",
          data: { type: "url", url: "https://example.test/image.png" },
        },
      ],
    });
  });
});

function createModel(
  resultOverrides: Partial<LanguageModelV4GenerateResult> = {},
  options: {
    litterboxUpload?: boolean;
    fetch?: (
      input: string | URL | Request,
      init?: RequestInit,
    ) => Promise<Response>;
  } = {},
) {
  const close = vi.fn(async () => {});
  const server = {
    host: "127.0.0.1",
    port: 1234,
    url: "http://127.0.0.1:1234/v1",
    close,
    server: { unref: vi.fn() },
  } as unknown as RunningOpenAIOAuthServer;
  const startServer = vi.fn(async () => server);
  const result: LanguageModelV4GenerateResult = {
    content: [],
    finishReason: { unified: "stop", raw: "stop" },
    usage: {
      inputTokens: {
        total: 1,
        noCache: 1,
        cacheRead: 0,
        cacheWrite: 0,
      },
      outputTokens: { total: 1, text: 1, reasoning: 0 },
    },
    warnings: [],
    ...resultOverrides,
  };
  const doGenerate = vi.fn(
    async (_options: LanguageModelV4CallOptions) => result,
  );
  const delegate: LanguageModelV4 = {
    specificationVersion: "v4",
    provider: "openai.chat",
    modelId: "gpt-test",
    supportedUrls: {},
    doGenerate,
    doStream: vi.fn(async (): Promise<LanguageModelV4StreamResult> => ({
      stream: new ReadableStream(),
    })),
  };
  const createDelegate = vi.fn(() => delegate);
  const model = new CodexLanguageModel({
    modelId: "gpt-test",
    startServer,
    createDelegate,
    ...options,
  });
  return { model, delegate, doGenerate, startServer, createDelegate, close };
}

function imageOptions(): LanguageModelV4CallOptions {
  return {
    prompt: [
      {
        role: "user",
        content: [
          {
            type: "file",
            mediaType: "image/png",
            data: { type: "data", data: "aW1hZ2U=" },
          },
        ],
      },
    ],
  };
}
