import { ChatCodex } from "@alumnium/langchain-codex";
import { ChatAnthropic } from "@langchain/anthropic";
import { ChatBedrockConverse } from "@langchain/aws";
import type { BaseCache } from "@langchain/core/caches";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatGoogle } from "@langchain/google";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatOllama } from "@langchain/ollama";
import {
  AzureChatOpenAI,
  type AzureChatOpenAIFields,
  ChatOpenAI,
  type ChatOpenAIFields,
} from "@langchain/openai";
import { ChatXAI } from "@langchain/xai";
import type { DocumentType } from "@smithy/types";
import { never } from "alwaysly";
import { Model } from "../Model.ts";
import { Logger } from "../telemetry/Logger.ts";

const logger = Logger.get(import.meta.url);

const parsedModelTimeout = parseInt(process.env.ALUMNIUM_MODEL_TIMEOUT ?? "90");
export const MODEL_TIMEOUT_SEC = Number.isFinite(parsedModelTimeout)
  ? parsedModelTimeout
  : 90;

const DEFAULT_LLM_RETRIES = 8;

export let MODEL_RETRIES = parseInt(
  process.env.ALUMNIUM_MODEL_RETRIES || String(DEFAULT_LLM_RETRIES),
);
if (isNaN(MODEL_RETRIES)) MODEL_RETRIES = DEFAULT_LLM_RETRIES;
if (MODEL_RETRIES < 0) MODEL_RETRIES = 0;

/**
 * Factory for creating LLM instances based on model configuration.
 */
export class LlmFactory {
  /**
   * Create an LLM instance based on the model configuration.
   */
  static createLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.info(
      `Creating LLM for model: ${model.provider}/${model.name} (timeout: ${MODEL_TIMEOUT_SEC}s, retries: ${MODEL_RETRIES})`,
    );

    switch (model.provider) {
      case "azure_foundry":
      case "azure_openai":
        return LlmFactory.createAzureLlm(model, cache);
      case "anthropic":
        return LlmFactory.createAnthropicLlm(model, cache);
      case "aws_anthropic":
      case "aws_meta":
        return LlmFactory.createAwsLlm(model, cache);
      case "codex":
        return LlmFactory.createCodexLlm(model, cache);
      case "deepseek":
        return LlmFactory.createDeepSeekLlm(model, cache);
      case "google":
        return LlmFactory.createGoogleLlm(model, cache);
      case "github":
        return LlmFactory.createGithubLlm(model, cache);
      case "mistralai":
        return LlmFactory.createMistralAiLlm(model, cache);
      case "ollama":
        return LlmFactory.createOllamaLlm(model, cache);
      case "openai":
        return LlmFactory.createOpenAiLlm(model, cache);
      case "xai":
        return LlmFactory.createXAiLlm(model, cache);
    }
  }

  static createAzureLlm(model: Model, cache: BaseCache): BaseChatModel {
    const variant =
      model.provider === "azure_foundry" ? "Azure Foundry" : "Azure OpenAI";
    logger.debug(`Creating ${variant} LLM with model ${model.name}`);

    const defaultFields: Partial<AzureChatOpenAIFields> = {
      // TODO: See the OpenAI LLM function for more info about the issue.
      // temperature: 0,
      cache,
    };
    const fields =
      model.provider === "azure_foundry"
        ? LlmFactory.azureFoundryLlmFields(model, defaultFields)
        : model.provider === "azure_openai"
          ? LlmFactory.azureOpenAiLlmFields(model, defaultFields)
          : never();

    if (!model.name.includes("gpt-4o")) {
      fields.reasoning = {
        effort: "low",
        summary: "auto",
      };
    }

    return new AzureChatOpenAI(fields);
  }

  static azureFoundryLlmFields(
    model: Model,
    defaults: Partial<AzureChatOpenAIFields>,
  ): AzureChatOpenAIFields {
    const openAIApiVersion = process.env.AZURE_FOUNDRY_API_VERSION;
    if (!openAIApiVersion) {
      throw new Error(
        "AZURE_FOUNDRY_API_VERSION environment variable is required for Azure Foundry models",
      );
    }

    return {
      azureOpenAIApiDeploymentName: model.name,
      openAIApiVersion,
      ...defaults,
    };
  }

  static azureOpenAiLlmFields(
    model: Model,
    defaults: Partial<AzureChatOpenAIFields>,
  ): AzureChatOpenAIFields {
    const azureOpenAIApiKey = process.env.AZURE_OPENAI_API_KEY;
    if (!azureOpenAIApiKey) {
      throw new Error(
        "AZURE_OPENAI_API_KEY environment variable is required for Azure OpenAI models",
      );
    }
    logMaskedSecret("Azure OpenAI API Key", azureOpenAIApiKey);

    const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    if (!azureOpenAIEndpoint) {
      throw new Error(
        "AZURE_OPENAI_ENDPOINT environment variable is required for Azure OpenAI models",
      );
    }
    logMaskedSecret("Azure OpenAI API Endpoint", azureOpenAIEndpoint);

    const azureOpenAIApiVersion = process.env.AZURE_OPENAI_API_VERSION;
    if (!azureOpenAIApiVersion) {
      throw new Error(
        "AZURE_OPENAI_API_VERSION environment variable is required for Azure OpenAI models",
      );
    }
    logMaskedSecret("Azure OpenAI API Version", azureOpenAIApiVersion);

    let defaultHeaders: Headers | undefined;
    const envHeaders = process.env.AZURE_OPENAI_DEFAULT_HEADERS;
    if (envHeaders) {
      try {
        defaultHeaders = new Headers(JSON.parse(envHeaders));
      } catch {
        logger.warn(
          "Failed to parse AZURE_OPENAI_DEFAULT_HEADERS, it should be a valid JSON string. Ignoring the variable.",
        );
      }
    }

    return {
      model: model.name,
      azureOpenAIApiKey,
      azureOpenAIApiVersion,
      // TODO: These configuration fields rely on LangChain JS SDK bug that
      // prevents endpoints without specifying instance and deployment names.
      // It has to be fixed or better replaced with a sane AI API client.
      // See: https://github.com/langchain-ai/langchainjs/blob/main/libs/providers/langchain-openai/src/utils/azure.ts#L38-L79
      azureOpenAIBasePath: azureOpenAIEndpoint,
      azureOpenAIApiDeploymentName: "openai",
      configuration: {
        defaultHeaders,
      },
      ...defaults,
    };
  }

  static createAnthropicLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.debug(`Creating Anthropic LLM with model ${model.name}`);

    return new ChatAnthropic({
      model: model.name,
      thinking: {
        type: "enabled",
        budget_tokens: 1024,
      },
      cache,
    });
  }

  static createAwsLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.debug(`Creating AWS LLM with model ${model.name}`);

    const accessKeyId = process.env.AWS_ACCESS_KEY ?? "";
    const secretAccessKey = process.env.AWS_SECRET_KEY ?? "";
    const region = process.env.AWS_REGION_NAME ?? "us-east-1";
    const additionalModelRequestFields: DocumentType = {};

    if (model.provider === "aws_anthropic") {
      additionalModelRequestFields.thinking = {
        type: "enabled",
        budget_tokens: 1024, // Minimum budget for Anthropic thinking
      };
    }

    return new ChatBedrockConverse({
      model: model.name,
      region,
      credentials: { accessKeyId, secretAccessKey },
      additionalModelRequestFields,
      cache,
    });
  }

  static createCodexLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.debug(`Creating Codex LLM with model ${model.name}`);
    return new ChatCodex({
      model: model.name,
      cache,
    });
  }

  static createDeepSeekLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.debug(`Creating DeepSeek LLM with model ${model.name}`);

    const deepSeek = new ReasonableChatDeepSeek({
      model: model.name,
      temperature: 0,
      cache,
    });

    return deepSeek;
  }

  static createGoogleLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.debug(`Creating Google LLM with model ${model.name}`);

    if (model.name.includes("gemini-2.0")) {
      return new ChatGoogle({
        model: model.name,
        temperature: 0,
        cache,
      });
    } else {
      return new ChatGoogle({
        model: model.name,
        temperature: 0,
        thinkingConfig: {
          thinkingLevel: "LOW",
          includeThoughts: true,
        },
        cache,
      });
    }
  }

  static createGithubLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.debug(`Creating Github LLM with model ${model.name}`);

    return new ChatOpenAI({
      model: model.name,
      configuration: { baseURL: "https://models.github.ai/inference" },
      temperature: 0,
      cache,
    });
  }

  static createMistralAiLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.debug(`Creating MistralAI LLM with model ${model.name}`);

    return new ChatMistralAI({
      model: model.name,
      temperature: 0,
      cache,
    });
  }

  static createOllamaLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.debug(`Creating Ollama LLM with model ${model.name}`);

    const baseUrl = process.env.OLLAMA_HOST || process.env.ALUMNIUM_OLLAMA_URL;
    if (baseUrl) {
      return new ChatOllama({
        model: model.name,
        baseUrl,
        cache,
      });
    } else {
      return new ChatOllama({
        model: model.name,
        cache,
      });
    }
  }

  static createOpenAiLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.debug(`Creating OpenAI LLM with model ${model.name}`);

    const fields: ChatOpenAIFields = {
      model: model.name,
      configuration: { baseURL: process.env.OPENAI_CUSTOM_URL },
      // TODO: Apparently the latest OpenAI models (o1, o3, o4, gpt-5) don't
      // accept temperature anymore, so we need to either conditionally include
      // it or figure out the correct way to set it for the new models.
      //
      // The error:
      //     > Unsupported parameter: 'temperature' is not supported with this model.
      //
      // See:
      // - https://community.openai.com/t/gpt-5-models-temperature/1337957
      // - https://community.openai.com/t/gpt-5-removed-parameters-logprob-top-p-temperature/1345768/2
      //
      // temperature: 0,
      cache,
    };

    if (model.name.includes("gpt-4o")) {
      if (!process.env.OPENAI_CUSTOM_URL) {
        // TODO: The seed parameter is deprecated and missing the LangChain
        // types, so we need to figure out the correct way to move forward.
        //
        // See: https://developers.openai.com/api/reference/resources/chat/subresources/completions/methods/create
        //
        // fields.seed = 1;
      }
    } else {
      fields.reasoning = {
        effort: "low",
        summary: "auto",
      };
    }

    return new ChatOpenAI(fields);
  }

  static createXAiLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.debug(`Creating XAI LLM with model ${model.name}`);

    return new ChatXAI({
      model: model.name,
      temperature: 0,
      cache,
    });
  }
}

function logMaskedSecret(name: string, secret: string) {
  logger.debug(`${name} is set: ${maskStr(secret)}`);
}

function maskStr(str: string, unmaskedStart = 4, unmaskedEnd = 4): string {
  if (str.length <= unmaskedStart + unmaskedEnd) {
    return "*".repeat(str.length);
  }
  const maskedLength = str.length - unmaskedStart - unmaskedEnd;
  return (
    str.slice(0, unmaskedStart) +
    "*".repeat(maskedLength) +
    str.slice(str.length - unmaskedEnd)
  );
}

class ReasonableChatDeepSeek extends ChatDeepSeek {
  override invocationParams(
    ...args: Parameters<ChatDeepSeek["invocationParams"]>
  ) {
    const params = super.invocationParams(...args);
    // NOTE: Workaround for "Error: 400 deepseek-reasoner does not support this tool_choice"
    // LangChain Python supports disabled_params, but it's missing in the JS SDK.
    delete params.tool_choice;
    return params;
  }
}
