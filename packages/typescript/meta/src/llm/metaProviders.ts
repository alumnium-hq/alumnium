import { createOpenAI } from "@ai-sdk/openai";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
  apiKeyField,
  withCallDefaults,
  Env,
  Logger,
  Model,
} from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

const META_API_URL = "https://api.meta.ai/v1";

export function createMetaLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating Meta LLM with model ${model.name}`);
  const provider = createOpenAI({
    name: "meta",
    baseURL: META_API_URL,
    ...apiKeyField(Env.META_API_KEY),
  });
  // Muse Spark models aren't known to the OpenAI SDK as reasoning models.
  return withCallDefaults(provider.responses(model.name), {
    reasoning: "low",
    providerOptions: { openai: { forceReasoning: true } },
  });
}

export const meta = Model.builder("meta", createMetaLlm);
