import { createAzure } from "@ai-sdk/azure";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
  requiredEnv,
  withCallDefaults,
  Env,
  Logger,
  maskString,
  Model,
} from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

export function createAzureLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating Azure LLM with model ${model.name}`);

  const apiKey = requiredEnv("AZURE_API_KEY", Env.AZURE_API_KEY, "Azure");
  const endpoint = requiredEnv("AZURE_ENDPOINT", Env.AZURE_ENDPOINT, "Azure");
  logger.debug(`Azure API Key is set: ${maskString(apiKey)}`);
  logger.debug(`Azure API Endpoint is set: ${maskString(endpoint)}`);

  // Azure SDK appends `/v1` only to Azure OpenAI hosts, so Foundry and other
  // hosts need the versioned base URL.
  const baseURL = `${endpoint.replace(/\/$/, "")}/openai`;
  const provider = createAzure({
    apiKey,
    baseURL: new URL(baseURL).hostname.endsWith(".openai.azure.com")
      ? baseURL
      : `${baseURL}/v1`,
    ...(Env.AZURE_DEFAULT_HEADERS
      ? { headers: Env.AZURE_DEFAULT_HEADERS }
      : {}),
  });
  return withCallDefaults(provider.responses(model.name), {
    reasoning: "low",
    providerOptions: { azure: { reasoningSummary: "auto" } },
  });
}

export const azure = Model.builder("azure", createAzureLlm);
