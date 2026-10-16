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

export function createOpenAiLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating OpenAI LLM with model ${model.name}`);
  const customURL = Env.OPENAI_CUSTOM_URL;
  const provider = createOpenAI({
    ...apiKeyField(Env.OPENAI_API_KEY),
    ...(customURL ? { baseURL: customURL } : {}),
    ...(Env.OPENAI_DEFAULT_HEADERS
      ? { headers: Env.OPENAI_DEFAULT_HEADERS }
      : {}),
  });
  const llm = customURL ? provider.chat(model.name) : provider(model.name);
  return model.name.includes("gpt-4o")
    ? llm
    : withCallDefaults(llm, {
        reasoning: "low",
        providerOptions: { openai: { reasoningSummary: "auto" } },
      });
}

export const openai = Model.builder("openai", createOpenAiLlm);
