import { createMistral } from "@ai-sdk/mistral";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
  apiKeyField,
  withCallDefaults,
  Env,
  Logger,
  Model,
} from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

export function createMistralLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating MistralAI LLM with model ${model.name}`);
  return withCallDefaults(
    createMistral(apiKeyField(Env.MISTRAL_API_KEY))(model.name),
    { temperature: 0 },
  );
}

export const mistral = Model.builder("mistralai", createMistralLlm);
