import {
  APICallError,
  type LanguageModelV4,
  type LanguageModelV4GenerateResult,
} from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import { Env } from "../../Env.ts";
import { AiSdkFactory } from "../../llm/__factories__/AiSdkFactory.ts";
import { Model } from "../../Model.ts";
import { BaseAgent } from "./BaseAgent.ts";

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllEnvs();
  Env.reset();
});

describe(BaseAgent, () => {
  it("retries a rate-limit error and disables AI SDK retries", async () => {
    vi.useFakeTimers();
    setModelEnv({ retries: "1" });
    const doGenerate = vi
      .fn()
      .mockRejectedValueOnce(apiError(429))
      .mockResolvedValueOnce(AiSdkFactory.generateResult({ text: "ok" }));
    const promise = createAgent(doGenerate).invokeForTest();

    await vi.advanceTimersByTimeAsync(1999);
    expect(doGenerate).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);

    await expect(promise).resolves.toMatchObject({ content: "ok" });
    expect(doGenerate).toHaveBeenCalledTimes(2);
  });

  it("gives every timeout attempt a fresh timeout budget", async () => {
    vi.useFakeTimers();
    setModelEnv({ retries: "1", timeout: "0.01" });
    const signals: AbortSignal[] = [];
    const doGenerate = vi.fn(
      async ({ abortSignal }: { abortSignal?: AbortSignal }) => {
        expect(abortSignal?.aborted).toBe(false);
        signals.push(abortSignal!);
        if (signals.length === 1) {
          throw new DOMException("Timed out", "TimeoutError");
        }
        return AiSdkFactory.generateResult({ text: "ok" });
      },
    );
    const promise = createAgent(doGenerate).invokeForTest();

    await vi.advanceTimersByTimeAsync(1999);
    expect(signals).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(signals).toHaveLength(2);
    expect(signals[1]).not.toBe(signals[0]);

    await expect(promise).resolves.toMatchObject({ content: "ok" });
    expect(doGenerate).toHaveBeenCalledTimes(2);
  });

  it("does not retry a non-retryable provider error", async () => {
    setModelEnv({ retries: "2" });
    const doGenerate = vi.fn().mockRejectedValue(apiError(400));

    await expect(
      createAgent(doGenerate).invokeForTest(),
    ).rejects.toBeInstanceOf(APICallError);
    expect(doGenerate).toHaveBeenCalledOnce();
  });

  it("honors ALUMNIUM_NO_RETRY", async () => {
    setModelEnv({ retries: "2" });
    vi.stubEnv("ALUMNIUM_NO_RETRY", "true");
    const doGenerate = vi.fn().mockRejectedValue(apiError(429));

    await expect(
      createAgent(doGenerate).invokeForTest(),
    ).rejects.toBeInstanceOf(APICallError);
    expect(doGenerate).toHaveBeenCalledOnce();
  });

  it("performs one attempt when retries are zero", async () => {
    setModelEnv({ retries: "0" });
    const doGenerate = vi.fn().mockRejectedValue(apiError(429));

    await expect(
      createAgent(doGenerate).invokeForTest(),
    ).rejects.toBeInstanceOf(APICallError);
    expect(doGenerate).toHaveBeenCalledOnce();
  });

  it("does not retry caller cancellation", async () => {
    setModelEnv({ retries: "2" });
    const controller = new AbortController();
    const doGenerate = vi.fn(
      ({ abortSignal }: { abortSignal?: AbortSignal }) =>
        new Promise<LanguageModelV4GenerateResult>((_, reject) => {
          if (abortSignal?.aborted) {
            reject(abortSignal.reason);
            return;
          }
          abortSignal?.addEventListener("abort", () =>
            reject(abortSignal.reason),
          );
        }),
    );
    const promise = createAgent(doGenerate).invokeForTest(controller.signal);

    await vi.waitFor(() => expect(doGenerate).toHaveBeenCalledOnce());
    controller.abort();

    await expect(promise).rejects.toMatchObject({ name: "AbortError" });
    expect(doGenerate).toHaveBeenCalledOnce();
  });
});

class ChangesAnalyzerAgent extends BaseAgent {
  invokeForTest(abortSignal?: AbortSignal) {
    return this.invokeModel({
      instructions: "Analyze changes",
      messages: [{ role: "user", content: "diff" }],
      meta: { kind: "changes-analyzer" },
      ...(abortSignal ? { abortSignal } : {}),
    });
  }
}

function createAgent(doGenerate: LanguageModelV4["doGenerate"]) {
  return new ChangesAnalyzerAgent(
    Model.parse("openai/test"),
    new MockLanguageModelV4({ doGenerate }),
  );
}

function apiError(statusCode: number) {
  return new APICallError({
    message: `HTTP ${statusCode}`,
    url: "https://example.test",
    requestBodyValues: {},
    statusCode,
  });
}

function setModelEnv({
  retries,
  timeout = "1",
}: {
  retries: string;
  timeout?: string;
}) {
  Env.reset();
  vi.stubEnv("ALUMNIUM_MODEL_RETRIES", retries);
  vi.stubEnv("ALUMNIUM_MODEL_TIMEOUT", timeout);
  vi.stubEnv("ALUMNIUM_NO_RETRY", "false");
}
