import type {
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
} from "@ai-sdk/provider";
import { AppId } from "../../AppId.ts";
import type { Cache } from "../../client/Cache.ts";
import { AiSdk } from "../../llm/AiSdk.ts";
import { createLlmUsage, type LlmUsage } from "../../llm/llmSchema.ts";
import type { Agent } from "../agents/Agent.ts";
import type { SessionContext } from "../session/SessionContext.ts";

export abstract class ServerCache {
  usage: LlmUsage = createLlmUsage();
  protected sessionContext: SessionContext;

  constructor(sessionContext: SessionContext) {
    this.sessionContext = sessionContext;
  }

  get app(): AppId {
    return this.sessionContext.app;
  }

  async lookup(
    _request: ServerCache.CacheRequest,
  ): Promise<LanguageModelV4GenerateResult | null> {
    return null;
  }

  async update(
    _request: ServerCache.CacheRequest,
    _result: LanguageModelV4GenerateResult,
  ): Promise<void> {}

  abstract save(): Promise<void>;

  abstract discard(): Promise<void>;

  abstract clear(props?: Cache.ClearProps): Promise<void>;

  protected applyUsage(result: LanguageModelV4GenerateResult): void {
    AiSdk.applyUsage(this.usage, result.usage);
  }
}

export namespace ServerCache {
  export type CacheKey = string & { readonly __brand: "ServerCache.CacheKey" };

  export interface CacheRequest {
    key: CacheKey;
    model: { provider: string; modelId: string };
    params: LanguageModelV4CallOptions;
    meta: Agent.Meta;
  }
}
