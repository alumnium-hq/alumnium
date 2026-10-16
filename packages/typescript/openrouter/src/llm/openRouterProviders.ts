import type { LanguageModelV4 } from "@ai-sdk/provider";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { apiKeyField, Env, Logger, Model } from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

export function createOpenRouterLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating OpenRouter LLM with model ${model.name}`);
  return createOpenRouter({
    ...apiKeyField(Env.OPENROUTER_API_KEY),
    appName: "Alumnium",
    appUrl: "https://alumnium.ai",
  })(model.name);
}

export const openrouter = Model.builder("openrouter", createOpenRouterLlm);
