import type { LanguageModelV4 } from "@ai-sdk/provider";
import { createOllama } from "ollama-ai-provider-v2";
import { Env, Logger, Model } from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

export function createOllamaLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating Ollama LLM with model ${model.name}`);
  const baseURL = Env.OLLAMA_HOST || Env.ALUMNIUM_OLLAMA_URL;
  const normalizedBaseURL = baseURL?.replace(/\/$/, "");
  return createOllama(
    normalizedBaseURL
      ? {
          baseURL: normalizedBaseURL.endsWith("/api")
            ? normalizedBaseURL
            : `${normalizedBaseURL}/api`,
        }
      : {},
  )(model.name);
}

export const ollama = Model.builder("ollama", createOllamaLlm);
