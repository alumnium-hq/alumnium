import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import { createAnthropic } from "@ai-sdk/anthropic";
import { createAzure } from "@ai-sdk/azure";
import { createDeepSeek } from "@ai-sdk/deepseek";
import { createGoogle } from "@ai-sdk/google";
import { createMistral } from "@ai-sdk/mistral";
import { createOpenAI } from "@ai-sdk/openai";
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from "@ai-sdk/provider";
import { createXai } from "@ai-sdk/xai";
import { createOllama } from "ollama-ai-provider-v2";
import { Env } from "../Env.ts";
import { CodexLanguageModel } from "../llm/CodexLanguageModel.ts";
import { Model } from "../Model.ts";
import { Logger } from "../telemetry/Logger.ts";
import { maskString } from "../utils/string.ts";

const logger = Logger.get(import.meta.url);

export const MODEL_TIMEOUT_SEC = Env.ALUMNIUM_MODEL_TIMEOUT;
export const MODEL_RETRIES = Env.ALUMNIUM_MODEL_RETRIES;

/** Factory for creating AI SDK language models from Alumnium model settings. */
export class LlmFactory {
  static createLlm(model: Model): LanguageModelV4 {
    logger.info(
      `Creating LLM for model: ${model.provider}/${model.name} (timeout: ${MODEL_TIMEOUT_SEC}s, retries: ${MODEL_RETRIES})`,
    );

    switch (model.provider) {
      case "azure_foundry":
      case "azure_openai":
        return LlmFactory.createAzureLlm(model);
      case "anthropic":
        return LlmFactory.createAnthropicLlm(model);
      case "aws_anthropic":
      case "aws_meta":
        return LlmFactory.createAwsLlm(model);
      case "codex":
        return LlmFactory.createCodexLlm(model);
      case "deepseek":
        return LlmFactory.createDeepSeekLlm(model);
      case "google":
        return LlmFactory.createGoogleLlm(model);
      case "mistralai":
        return LlmFactory.createMistralAiLlm(model);
      case "ollama":
        return LlmFactory.createOllamaLlm(model);
      case "openai":
        return LlmFactory.createOpenAiLlm(model);
      case "xai":
        return LlmFactory.createXAiLlm(model);
    }
  }

  static createAzureLlm(model: Model): LanguageModelV4 {
    const variant =
      model.provider === "azure_foundry" ? "Azure Foundry" : "Azure OpenAI";
    logger.debug(`Creating ${variant} LLM with model ${model.name}`);

    const provider =
      model.provider === "azure_foundry"
        ? LlmFactory.createAzureFoundryProvider()
        : LlmFactory.createAzureOpenAiProvider();
    const defaults = model.name.includes("gpt-4o")
      ? undefined
      : {
          reasoning: "low" as const,
          providerOptions: { azure: { reasoningSummary: "auto" } },
        };
    return withCallDefaults(provider.chat(model.name), defaults);
  }

  static createAzureFoundryProvider(): ReturnType<typeof createAzure> {
    const apiVersion = Env.AZURE_FOUNDRY_API_VERSION;
    if (!apiVersion) {
      throw new Error(
        "AZURE_FOUNDRY_API_VERSION environment variable is required for Azure Foundry models",
      );
    }

    const targetURI = Env.AZURE_FOUNDRY_TARGET_URI;
    const target = targetURI ? new URL(targetURI) : undefined;
    const targetParams = target
      ? new URLSearchParams(target.searchParams)
      : undefined;
    if (target) target.search = "";

    return createAzure({
      apiVersion,
      ...apiKeyField(Env.AZURE_FOUNDRY_API_KEY),
      ...(target ? { baseURL: target.toString() } : {}),
      fetch: Object.assign(
        async (input: string | URL | Request, init?: RequestInit) => {
          const url = new URL(
            input instanceof Request ? input.url : input.toString(),
          );
          for (const [name, value] of targetParams ?? []) {
            if (!url.searchParams.has(name))
              url.searchParams.append(name, value);
          }
          if (!url.searchParams.has("api-version"))
            url.searchParams.set("api-version", apiVersion);
          return fetch(url, init);
        },
        { preconnect: fetch.preconnect },
      ),
    });
  }

  static createAzureOpenAiProvider(): ReturnType<typeof createAzure> {
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
    const apiVersion = requiredEnv(
      "AZURE_OPENAI_API_VERSION",
      Env.AZURE_OPENAI_API_VERSION,
      "Azure OpenAI",
    );
    logMaskedSecret("Azure OpenAI API Key", apiKey);
    logMaskedSecret("Azure OpenAI API Endpoint", baseURL);
    logMaskedSecret("Azure OpenAI API Version", apiVersion);

    return createAzure({
      apiKey,
      baseURL: `${baseURL.replace(/\/$/, "")}/openai`,
      apiVersion,
      useDeploymentBasedUrls: true,
      ...(Env.AZURE_OPENAI_DEFAULT_HEADERS
        ? { headers: Env.AZURE_OPENAI_DEFAULT_HEADERS }
        : {}),
    });
  }

  static createAnthropicLlm(model: Model): LanguageModelV4 {
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

  static createAwsLlm(model: Model): LanguageModelV4 {
    logger.debug(`Creating AWS LLM with model ${model.name}`);
    const accessKeyId = Env.AWS_ACCESS_KEY;
    const secretAccessKey = Env.AWS_SECRET_KEY;
    const provider = createAmazonBedrock({
      region: Env.AWS_REGION_NAME,
      ...(accessKeyId && secretAccessKey
        ? { accessKeyId, secretAccessKey }
        : {}),
    });
    const llm = provider(model.name);
    if (model.provider !== "aws_anthropic") return llm;

    const additionalModelRequestFields = usesAdaptiveThinking(model.name)
      ? { thinking: { type: "adaptive" }, output_config: { effort: "low" } }
      : { thinking: { type: "enabled", budget_tokens: 1024 } };
    return withCallDefaults(llm, {
      providerOptions: { bedrock: { additionalModelRequestFields } },
    });
  }

  static createCodexLlm(model: Model): CodexLanguageModel {
    logger.debug(`Creating Codex LLM with model ${model.name}`);
    return new CodexLanguageModel({ modelId: model.name });
  }

  static createDeepSeekLlm(model: Model): LanguageModelV4 {
    logger.debug(`Creating DeepSeek LLM with model ${model.name}`);
    const defaults: Partial<LanguageModelV4CallOptions> = { temperature: 0 };
    return withCallDefaults(
      createDeepSeek(apiKeyField(Env.DEEPSEEK_API_KEY))(model.name),
      defaults,
      model.name === "deepseek-reasoner" ? ["toolChoice"] : undefined,
    );
  }

  static createGoogleLlm(model: Model): LanguageModelV4 {
    logger.debug(`Creating Google LLM with model ${model.name}`);
    return withCallDefaults(
      createGoogle(apiKeyField(Env.GOOGLE_API_KEY))(model.name),
      model.name.includes("gemini-2.0")
        ? { temperature: 0 }
        : {
            temperature: 0,
            providerOptions: {
              google: {
                thinkingConfig: {
                  thinkingLevel: "low",
                  includeThoughts: true,
                },
              },
            },
          },
    );
  }

  static createGithubLlm(model: Model): LanguageModelV4 {
    logger.debug(`Creating Github LLM with model ${model.name}`);
    return withCallDefaults(
      createOpenAI({
        baseURL: "https://models.github.ai/inference",
        ...apiKeyField(Env.OPENAI_API_KEY),
        name: "github",
      }).chat(model.name),
      { temperature: 0 },
    );
  }

  static createMistralAiLlm(model: Model): LanguageModelV4 {
    logger.debug(`Creating MistralAI LLM with model ${model.name}`);
    return withCallDefaults(
      createMistral(apiKeyField(Env.MISTRAL_API_KEY))(model.name),
      { temperature: 0 },
    );
  }

  static createOllamaLlm(model: Model): LanguageModelV4 {
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

  static createOpenAiLlm(model: Model): LanguageModelV4 {
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

  static createXAiLlm(model: Model): LanguageModelV4 {
    logger.debug(`Creating XAI LLM with model ${model.name}`);
    return withCallDefaults(
      createXai(apiKeyField(Env.XAI_API_KEY))(model.name),
      {
        temperature: 0,
        providerOptions: {
          xai: { reasoningEffort: "low", reasoningSummary: "auto" },
        },
      },
    );
  }
}

function withCallDefaults(
  model: LanguageModelV4,
  defaults:
    | Pick<
        Partial<LanguageModelV4CallOptions>,
        "temperature" | "reasoning" | "providerOptions"
      >
    | undefined,
  omittedKeys: Array<keyof LanguageModelV4CallOptions> = [],
): LanguageModelV4 {
  if (!defaults && !omittedKeys.length) return model;

  function optionsWithDefaults(
    options: LanguageModelV4CallOptions,
  ): LanguageModelV4CallOptions {
    const merged = { ...options };
    if (merged.temperature === undefined && defaults?.temperature !== undefined)
      merged.temperature = defaults.temperature;
    if (merged.reasoning === undefined && defaults?.reasoning !== undefined)
      merged.reasoning = defaults.reasoning;
    const providerOptions = mergeProviderOptions(
      defaults?.providerOptions,
      options.providerOptions,
    );
    if (providerOptions) merged.providerOptions = providerOptions;
    for (const key of omittedKeys) delete merged[key];
    return merged;
  }

  return {
    specificationVersion: "v4",
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    doGenerate: (options) => model.doGenerate(optionsWithDefaults(options)),
    doStream: (options) => model.doStream(optionsWithDefaults(options)),
  };
}

function mergeProviderOptions(
  defaults: LanguageModelV4CallOptions["providerOptions"],
  options: LanguageModelV4CallOptions["providerOptions"],
): LanguageModelV4CallOptions["providerOptions"] {
  if (!defaults) return options;
  if (!options) return defaults;

  const merged = { ...defaults };
  for (const [provider, values] of Object.entries(options)) {
    merged[provider] = { ...defaults[provider], ...values };
  }
  return merged;
}

function apiKeyField(apiKey: string | undefined): { apiKey: string } | object {
  return apiKey ? { apiKey } : {};
}

function requiredEnv(
  name: string,
  value: string | undefined,
  provider: string,
) {
  if (!value) {
    throw new Error(
      `${name} environment variable is required for ${provider} models`,
    );
  }
  return value;
}

function usesAdaptiveThinking(modelName: string): boolean {
  const match = modelName.match(/claude-[a-z]+-(\d+)(?:-(\d{1,2})(?!\d))?/);
  if (!match) return false;

  const major = Number(match[1]);
  const minor = match[2] ? Number(match[2]) : 0;
  return major > 4 || (major === 4 && minor >= 6);
}

function logMaskedSecret(name: string, secret: string) {
  logger.debug(`${name} is set: ${maskString(secret)}`);
}
