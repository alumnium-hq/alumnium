import z from "zod";
import type { Model } from "../Model.ts";
import type { Agent } from "./agents/Agent.ts";

export namespace LlmContext {
  export type Meta = Agent.Meta;

  export type Prompt = z.infer<typeof LlmContext.Prompt>;

  export type LlmKey = z.infer<typeof LlmContext.LlmKey>;
}

export class LlmContext {
  static Prompt = z.string().brand("LlmContext.Prompt");

  static LlmKey = z.string().brand("LlmContext.LlmKey");

  readonly model: Model;

  constructor(model: Model) {
    this.model = model;
  }

  #promptsMeta: Record<string, LlmContext.Meta> = {};

  assignPromptsMeta(prompts: string[], meta: LlmContext.Meta) {
    for (const prompt of prompts) {
      this.#promptsMeta[prompt] = meta;
    }
  }

  clearPromptsMeta(prompts: string[]) {
    for (const prompt of prompts) {
      delete this.#promptsMeta[prompt];
    }
  }

  getPromptMeta(prompt: string): LlmContext.Meta | undefined {
    return this.#promptsMeta[prompt];
  }
}
