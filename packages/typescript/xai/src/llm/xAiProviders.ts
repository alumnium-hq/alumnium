import type { LanguageModelV4 } from "@ai-sdk/provider";
import { createXai } from "@ai-sdk/xai";
import {
  apiKeyField,
  withCallDefaults,
  Env,
  Logger,
  Model,
} from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

export function createXAiLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating XAI LLM with model ${model.name}`);
  return withCallDefaults(createXai(apiKeyField(Env.XAI_API_KEY))(model.name), {
    temperature: 0,
    reasoning: "low",
    providerOptions: { xai: { reasoningSummary: "auto" } },
  });
}

export const xai = Model.builder("xai", createXAiLlm);
