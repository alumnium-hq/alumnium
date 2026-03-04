import { ChatAnthropic } from "@langchain/anthropic";
import { ChatBedrockConverse } from "@langchain/aws";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { ChatDeepSeek } from "@langchain/deepseek";
import { ChatGoogleGenerativeAI } from "@langchain/google-genai";
import { ChatMistralAI } from "@langchain/mistralai";
import { ChatOllama } from "@langchain/ollama";
import {
  AzureChatOpenAI,
  AzureChatOpenAIFields,
  ChatOpenAI,
  ChatOpenAIFields,
} from "@langchain/openai";
import { ChatXAI } from "@langchain/xai";
import type { DocumentType } from "@smithy/types";
import { never } from "alwaysly";
import { Model, Provider } from "../Model.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger(import.meta.url);

/**
 * Factory for creating LLM instances based on model configuration.
 */
export class LLMFactory {
  /**
   * Create an LLM instance based on the model configuration.
   */
  static createLlm(model: Model): BaseChatModel {
    logger.info(`Creating LLM for model: ${model.provider}/${model.name}`);

    switch (model.provider) {
      case Provider.AZURE_FOUNDRY:
      case Provider.AZURE_OPENAI:
        return LLMFactory.createAzureLlm(model);
      case Provider.ANTHROPIC:
        return LLMFactory.createAnthropicLlm(model);
      case Provider.AWS_ANTHROPIC:
      case Provider.AWS_META:
        return LLMFactory.createAwsLlm(model);
      case Provider.DEEPSEEK:
        return LLMFactory.createDeepSeekLlm(model);
      case Provider.GOOGLE:
        return LLMFactory.createGoogleLlm(model);
      case Provider.GITHUB:
        return LLMFactory.createGithubLlm(model);
      case Provider.MISTRALAI:
        return LLMFactory.createMistralAiLlm(model);
      case Provider.OLLAMA:
        return LLMFactory.createOllamaLlm(model);
      case Provider.OPENAI:
        return LLMFactory.createOpenAiLlm(model);
      case Provider.XAI:
        return LLMFactory.createXAiLlm(model);
    }
  }

  static createAzureLlm(model: Model): BaseChatModel {
    const variant = Provider.AZURE_FOUNDRY ? "Azure Foundry" : "Azure OpenAI";
    logger.debug(`Creating ${variant} LLM with model ${model.name}`);

    const defaultFields: Partial<AzureChatOpenAIFields> = {
      // TODO: See the OpenAI LLM function for more info about the issue.
      // temperature: 0,
    };
    const fields =
      model.provider === Provider.AZURE_FOUNDRY
        ? LLMFactory.azureFoundryLlmFields(model, defaultFields)
        : model.provider === Provider.AZURE_OPENAI
          ? LLMFactory.azureOpenAiLlmFields(model, defaultFields)
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

  static createAnthropicLlm(model: Model): BaseChatModel {
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
    });
  }

  static createAwsLlm(model: Model): BaseChatModel {
    logger.debug(`Creating AWS LLM with model ${model.name}`);

    const accessKeyId = process.env.AWS_ACCESS_KEY ?? "";
    const secretAccessKey = process.env.AWS_SECRET_KEY ?? "";
    const region = process.env.AWS_REGION_NAME ?? "us-east-1";
    const additionalModelRequestFields: DocumentType = {};

    if (model.provider === Provider.AWS_ANTHROPIC) {
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
    });
  }

  static createDeepSeekLlm(model: Model): BaseChatModel {
    logger.debug(`Creating DeepSeek LLM with model ${model.name}`);

    return new ChatDeepSeek({
      model: model.name,
      temperature: 0,
      // TODO: Python implementation also includes field missing in JS SDK:
      //     disabled_params={"tool_choice": None}
    });
  }

  static createGoogleLlm(model: Model): BaseChatModel {
    logger.debug(`Creating Google LLM with model ${model.name}`);

    if (model.name.includes("gemini-2.0")) {
      return new ChatGoogleGenerativeAI({
        model: model.name,
        temperature: 0,
      });
    } else {
      return new ChatGoogleGenerativeAI({
        model: model.name,
        temperature: 0,
        thinkingConfig: {
          thinkingLevel: "LOW",
          includeThoughts: true,
        },
      });
    }
  }

  static createGithubLlm(model: Model): BaseChatModel {
    logger.debug(`Creating Github LLM with model ${model.name}`);

    return new ChatOpenAI({
      model: model.name,
      configuration: { baseURL: "https://models.github.ai/inference" },
      temperature: 0,
    });
  }

  static createMistralAiLlm(model: Model): BaseChatModel {
    logger.debug(`Creating MistralAI LLM with model ${model.name}`);

    return new ChatMistralAI({
      model: model.name,
      temperature: 0,
    });
  }

  static createOllamaLlm(model: Model): BaseChatModel {
    logger.debug(`Creating Ollama LLM with model ${model.name}`);

    const baseUrl = process.env.ALUMNIUM_OLLAMA_URL;
    if (baseUrl) {
      return new ChatOllama({
        model: model.name,
        baseUrl,
        temperature: 0,
      });
    } else {
      return new ChatOllama({
        model: model.name,
        temperature: 0,
      });
    }
  }

  static createOpenAiLlm(model: Model): BaseChatModel {
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

  static createXAiLlm(model: Model): BaseChatModel {
    logger.debug(`Creating XAI LLM with model ${model.name}`);

    return new ChatXAI({
      model: model.name,
      temperature: 0,
    });
  }
}
