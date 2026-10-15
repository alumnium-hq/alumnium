import { createAnthropic } from "@ai-sdk/anthropic";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
  apiKeyField,
  LlmFactory,
  usesAdaptiveThinking,
  withCallDefaults,
  Env,
  Logger,
  type Model,
} from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

export function createAnthropicLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating Anthropic LLM with model ${model.name}`);
  const llm = createAnthropic(apiKeyField(Env.ANTHROPIC_API_KEY))(model.name);
  return withCallDefaults(llm, {
    providerOptions: {
      anthropic: usesAdaptiveThinking(model.name)
        ? {
            thinking: { type: "adaptive", display: "summarized" },
            effort: "low",
          }
        : {
            thinking: { type: "enabled", budgetTokens: 1024 },
            sendReasoning: true,
          },
    },
  });
}

export const anthropicProviders: LlmFactory.Providers = {
  anthropic: createAnthropicLlm,
};

LlmFactory.register(anthropicProviders);
