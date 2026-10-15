import { createGoogle } from "@ai-sdk/google";
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

export function createGoogleLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating Google LLM with model ${model.name}`);
  return withCallDefaults(
    createGoogle(apiKeyField(Env.GOOGLE_API_KEY))(model.name),
    model.name.includes("gemini-2.0")
      ? { temperature: 0 }
      : { temperature: 0, reasoning: "low" },
  );
}

export const googleProviders: LlmFactory.Providers = {
  google: createGoogleLlm,
};

LlmFactory.register(googleProviders);
