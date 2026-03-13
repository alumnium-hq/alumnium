import { ChatAnthropic } from "@langchain/anthropic";
import { ChatBedrockConverse } from "@langchain/aws";
import type { BaseCache } from "@langchain/core/caches";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
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
import { Model } from "../Model.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger(import.meta.url);

/**
 * Factory for creating LLM instances based on model configuration.
 */
export class LlmFactory {
  /**
   * Create an LLM instance based on the model configuration.
   */
  static createLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.info(`Creating LLM for model: ${model.provider}/${model.name}`);

    switch (model.provider) {
      case "azure_foundry":
      case "azure_openai":
        return LlmFactory.createAzureLlm(model, cache);
      case "anthropic":
        return LlmFactory.createAnthropicLlm(model, cache);
      case "aws_anthropic":
      case "aws_meta":
        return LlmFactory.createAwsLlm(model, cache);
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
    const azureOpenAIEndpoint = process.env.AZURE_OPENAI_ENDPOINT;
    if (!azureOpenAIEndpoint) {
      throw new Error(
        "AZURE_OPENAI_ENDPOINT environment variable is required for Azure OpenAI models",
      );
    }

    const azureOpenAIApiVersion = process.env.AZURE_OPENAI_API_VERSION;
    if (!azureOpenAIApiVersion) {
      throw new Error(
        "AZURE_OPENAI_API_VERSION environment variable is required for Azure OpenAI models",
      );
    }

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
      // TODO: Python implementation also includes fields missing in JS SDK:
      //     stop=None,
      //     timeout=None,
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

  static createDeepSeekLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.debug(`Creating DeepSeek LLM with model ${model.name}`);

    return new ChatDeepSeek({
      model: model.name,
      temperature: 0,
      // TODO: Python implementation also includes field missing in JS SDK:
      //     disabled_params={"tool_choice": None}
      cache,
    });
  }

  static createGoogleLlm(model: Model, cache: BaseCache): BaseChatModel {
    logger.debug(`Creating Google LLM with model ${model.name}`);

    if (model.name.includes("gemini-2.0")) {
      return new ChatGoogleGenerativeAI({
        model: model.name,
        temperature: 0,
        cache,
      });
    } else {
      return new ChatGoogleGenerativeAI({
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

    const baseUrl = process.env.ALUMNIUM_OLLAMA_URL;
    if (baseUrl) {
      return new ChatOllama({
        model: model.name,
        baseUrl,
        temperature: 0,
        cache,
      });
    } else {
      return new ChatOllama({
        model: model.name,
        temperature: 0,
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
