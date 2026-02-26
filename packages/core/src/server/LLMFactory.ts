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
    const defaultFields: Partial<AzureChatOpenAIFields> = {
      temperature: 0,
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
    const azureOpenAIEndpoint = import.meta.env.AZURE_FOUNDRY_TARGET_URI;
    const apiKey = import.meta.env.AZURE_FOUNDRY_API_KEY;
    const openAIApiVersion = import.meta.env.AZURE_FOUNDRY_API_VERSION;
    if (!azureOpenAIEndpoint) {
      throw new Error(
        "AZURE_FOUNDRY_TARGET_URI environment variable is required for Azure Foundry models",
      );
    }
    if (!openAIApiVersion) {
      throw new Error(
        "AZURE_FOUNDRY_API_VERSION environment variable is required for Azure Foundry models",
      );
    }
    return {
      azureOpenAIEndpoint,
      azureOpenAIApiDeploymentName: model.name,
      apiKey,
      openAIApiVersion,
      ...defaults,
    };
  }

  static azureOpenAiLlmFields(
    model: Model,
    defaults: Partial<AzureChatOpenAIFields>,
  ): AzureChatOpenAIFields {
    const openAIApiVersion = import.meta.env.AZURE_OPENAI_API_VERSION;
    if (!openAIApiVersion) {
      throw new Error(
        "AZURE_OPENAI_API_VERSION environment variable is required for Azure OpenAI models",
      );
    }
    return {
      model: model.name,
      openAIApiVersion,
      ...defaults,
    };
  }

  static createAnthropicLlm(model: Model): BaseChatModel {
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
    const accessKeyId = import.meta.env.AWS_ACCESS_KEY ?? "";
    const secretAccessKey = import.meta.env.AWS_SECRET_KEY ?? "";
    const region = import.meta.env.AWS_REGION_NAME ?? "us-east-1";
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
    return new ChatDeepSeek({
      model: model.name,
      temperature: 0,
      // TODO: Python implementation also includes field missing in JS SDK:
      //     disabled_params={"tool_choice": None}
    });
  }

  static createGoogleLlm(model: Model): BaseChatModel {
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
    return new ChatOpenAI({
      model: model.name,
      configuration: { baseURL: "https://models.github.ai/inference" },
      temperature: 0,
    });
  }

  static createMistralAiLlm(model: Model): BaseChatModel {
    return new ChatMistralAI({
      model: model.name,
      temperature: 0,
    });
  }

  static createOllamaLlm(model: Model): BaseChatModel {
    const baseUrl = import.meta.env.ALUMNIUM_OLLAMA_URL;
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
    const fields: ChatOpenAIFields = {
      model: model.name,
      configuration: { baseURL: import.meta.env.OPENAI_CUSTOM_URL },
      temperature: 0,
    };

    if (model.name.includes("gpt-4o")) {
      if (!import.meta.env.OPENAI_CUSTOM_URL) {
        // @ts-expect-error -- TODO: JS SDK has no seed parameter, however
        // Python SDK does. Figure out if types are incorrect or if we need to
        // set seed in a different way for JS SDK.
        fields.seed = 1;
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
    return new ChatXAI({
      model: model.name,
      temperature: 0,
    });
  }
}
