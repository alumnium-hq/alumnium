import { generateText, Output } from "ai";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import z from "zod";
import { Env } from "@alumnium/core/internal";
import { createAwsLlm } from "./awsProviders.ts";

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => {
      throw new Error("request captured");
    }),
  );
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
  Env.reset();
});

describe("AWS Meta AWS Meta requests", () => {
  it("does not force the schema tool for structured output", async () => {
    vi.stubEnv("AWS_ACCESS_KEY", "access-key");
    vi.stubEnv("AWS_SECRET_KEY", "secret-key");
    vi.stubEnv("AWS_REGION_NAME", "us-east-1");
    Env.reset();
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          output: {
            message: {
              role: "assistant",
              content: [
                {
                  toolUse: {
                    toolUseId: "tool-1",
                    name: "json",
                    input: { answer: 42 },
                  },
                },
              ],
            },
          },
          stopReason: "tool_use",
          usage: { inputTokens: 10, outputTokens: 5, totalTokens: 15 },
        }),
        { headers: { "content-type": "application/json" } },
      ),
    );

    const model = createAwsLlm({
      provider: "aws_meta",
      name: "us.meta.llama4-maverick-17b-instruct-v1:0",
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
    const [, init] = vi.mocked(fetch).mock.calls[0] ?? [];
    const body = JSON.parse(String(init?.body));
    expect(body.toolConfig).toEqual({
      tools: [
        {
          toolSpec: expect.objectContaining({
            name: "json",
          }),
        },
      ],
    });
  });
});
