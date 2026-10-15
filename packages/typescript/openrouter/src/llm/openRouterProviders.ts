import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
  apiKeyField,
  LlmFactory,
  Env,
  Logger,
  type Model,
} from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

export function createOpenRouterLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating OpenRouter LLM with model ${model.name}`);
  return createOpenRouter({
    ...apiKeyField(Env.OPENROUTER_API_KEY),
    appName: "Alumnium",
    appUrl: "https://alumnium.ai",
  })(model.name);
}

export const openRouterProviders: LlmFactory.Providers = {
  openrouter: createOpenRouterLlm,
};

LlmFactory.register(openRouterProviders);
