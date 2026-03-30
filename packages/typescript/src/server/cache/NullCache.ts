import type { Generation } from "@langchain/core/outputs";
import { LlmContext } from "../LlmContext.js";
import { ServerCache } from "./ServerCache.js";

export class NullCache extends ServerCache {
  override async lookup(
    _prompt: LlmContext.Prompt,
    _llmKey: LlmContext.LlmKey,
  ): Promise<Generation[] | null> {
    return null;
  }

  override async update(
    _prompt: LlmContext.Prompt,
    _llmKey: LlmContext.LlmKey,
    _generations: Generation[],
  ): Promise<void> {}

  async save(): Promise<void> {}

  async discard(): Promise<void> {}

  async clear(): Promise<void> {}
}
