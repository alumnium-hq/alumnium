import { createMistral } from "@ai-sdk/mistral";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
  apiKeyField,
  LlmFactory,
  withCallDefaults,
  Env,
  Logger,
  type Model,
} from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

export function createMistralLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating MistralAI LLM with model ${model.name}`);
  return withCallDefaults(
    createMistral(apiKeyField(Env.MISTRAL_API_KEY))(model.name),
    { temperature: 0 },
  );
}

export const mistralProviders: LlmFactory.Providers = {
  mistralai: createMistralLlm,
};

LlmFactory.register(mistralProviders);
