import { createAzure } from "@ai-sdk/azure";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
  apiKeyField,
  LlmFactory,
  requiredEnv,
  withCallDefaults,
  Env,
  Logger,
  maskString,
  type Model,
} from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

export function createAzureLlm(model: Model): LanguageModelV4 {
  const variant =
    model.provider === "azure_foundry" ? "Azure Foundry" : "Azure OpenAI";
  logger.debug(`Creating ${variant} LLM with model ${model.name}`);

  const provider =
    model.provider === "azure_foundry"
      ? createAzureFoundryProvider()
      : createAzureOpenAiProvider();
  const defaults = model.name.includes("gpt-4o")
    ? undefined
    : {
        reasoning: "low" as const,
        providerOptions: { azure: { reasoningSummary: "auto" } },
      };
  return withCallDefaults(provider.responses(model.name), defaults);
}

function createAzureFoundryProvider(): ReturnType<typeof createAzure> {
  const targetURI = Env.AZURE_FOUNDRY_TARGET_URI?.replace(/\/$/, "");
  const target = targetURI ? new URL(`${targetURI}/openai`) : undefined;
  const targetParams = target
    ? new URLSearchParams(target.searchParams)
    : undefined;
  if (target) target.search = "";

  return createAzure({
    ...apiKeyField(Env.AZURE_FOUNDRY_API_KEY),
    ...(target ? { baseURL: target.toString() } : {}),
    fetch: Object.assign(
      async (input: string | URL | Request, init?: RequestInit) => {
        const url = new URL(
          input instanceof Request ? input.url : input.toString(),
        );
        for (const [name, value] of targetParams ?? []) {
          if (!url.searchParams.has(name)) url.searchParams.append(name, value);
        }
        return fetch(url, init);
      },
      { preconnect: fetch.preconnect },
    ),
  });
}

function createAzureOpenAiProvider(): ReturnType<typeof createAzure> {
  const apiKey = requiredEnv(
    "AZURE_OPENAI_API_KEY",
    Env.AZURE_OPENAI_API_KEY,
    "Azure OpenAI",
  );
  const baseURL = requiredEnv(
    "AZURE_OPENAI_ENDPOINT",
    Env.AZURE_OPENAI_ENDPOINT,
    "Azure OpenAI",
  );
  logger.debug(`Azure OpenAI API Key is set: ${maskString(apiKey)}`);
  logger.debug(`Azure OpenAI API Endpoint is set: ${maskString(baseURL)}`);

  return createAzure({
    apiKey,
    baseURL: `${baseURL.replace(/\/$/, "")}/openai`,
    ...(Env.AZURE_OPENAI_DEFAULT_HEADERS
      ? { headers: Env.AZURE_OPENAI_DEFAULT_HEADERS }
      : {}),
  });
}

export const azureProviders: LlmFactory.Providers = {
  azure_foundry: createAzureLlm,
  azure_openai: createAzureLlm,
};

LlmFactory.register(azureProviders);
