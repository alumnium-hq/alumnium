import type { LanguageModelV4CallOptions } from "@ai-sdk/provider";
import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AppId } from "../AppId.ts";
import type { Alumni } from "../client/Alumni.ts";
import { Env } from "../Env.ts";
import { Model } from "../Model.ts";
import { Session } from "../server/session/Session.ts";
import type { SessionId } from "../server/session/SessionId.ts";
import { AiSdkFactory } from "./__factories__/AiSdkFactory.ts";

afterEach(() => {
  vi.unstubAllEnvs();
  Env.reset();
});

describe("custom language model", () => {
  it("accepts a concrete AI SDK model in public options", () => {
    const llm = new MockLanguageModelV4();
    const options = { llm } satisfies Alumni.Options;

    expect(options.llm).toBe(llm);
  });

  it("rejects model ID strings in public options", () => {
    const options: Alumni.Options = {
      // @ts-expect-error -- Custom models must be concrete model objects.
      llm: "openai/gpt-5",
    };

    expect(options.llm).toBe("openai/gpt-5");
  });

  it("wraps and invokes a supplied concrete model", async () => {
    vi.stubEnv("ALUMNIUM_CACHE", "false");
    Env.reset();
    const doGenerate = vi.fn(async (_options: LanguageModelV4CallOptions) =>
      AiSdkFactory.generateResult({ text: "No relevant changes" }),
    );
    const llm = new MockLanguageModelV4({ doGenerate });
    const session = new Session({
      app: "test-app" as AppId,
      sessionId: "test-session" as SessionId,
      model: Model.parse("openai/test"),
      platform: "chromium",
      tools: [],
      llm,
    });

    await expect(session.changesAnalyzerAgent.invoke("diff")).resolves.toBe(
      "No relevant changes",
    );
    expect(doGenerate).toHaveBeenCalledOnce();
    expect(llm.doGenerateCalls[0]?.providerOptions).toBeUndefined();
  });
});
