import { createDeepSeek } from "@ai-sdk/deepseek";
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

export function createDeepSeekLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating DeepSeek LLM with model ${model.name}`);
  return withCallDefaults(
    createDeepSeek(apiKeyField(Env.DEEPSEEK_API_KEY))(model.name),
    { temperature: 0, reasoning: "low" },
    model.name === "deepseek-reasoner" ? ["toolChoice"] : undefined,
  );
}

export const deepSeekProviders: LlmFactory.Providers = {
  deepseek: createDeepSeekLlm,
};

LlmFactory.register(deepSeekProviders);
