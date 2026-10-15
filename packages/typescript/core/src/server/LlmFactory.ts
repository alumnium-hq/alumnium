import type { LanguageModelV4 } from "@ai-sdk/provider";
import { Env } from "../Env.ts";
import { type Model } from "../Model.ts";
import { Logger } from "../telemetry/Logger.ts";

const logger = Logger.get(import.meta.url);

export const MODEL_TIMEOUT_SEC = Env.ALUMNIUM_MODEL_TIMEOUT;
export const MODEL_RETRIES = Env.ALUMNIUM_MODEL_RETRIES;

export namespace LlmFactory {
  /** Creates a language model for the given model settings. */
  export type Provider = (model: Model) => LanguageModelV4;

  export type Providers = Partial<Record<Model.Provider, Provider>>;
}

/** npm packages providing the LLM providers, used in error messages. */
const PROVIDER_PACKAGES: Record<Model.Provider, string> = {
  anthropic: "@alumnium/anthropic",
  aws_anthropic: "@alumnium/aws",
  aws_meta: "@alumnium/aws",
  azure_foundry: "@alumnium/azure",
  azure_openai: "@alumnium/azure",
  codex: "@alumnium/codex",
  cursor: "@alumnium/cursor",
  deepseek: "@alumnium/deepseek",
  google: "@alumnium/google",
  mistralai: "@alumnium/mistral",
  ollama: "@alumnium/ollama",
  openai: "@alumnium/openai",
  openrouter: "@alumnium/openrouter",
  xai: "@alumnium/xai",
};

const providers: LlmFactory.Providers = {};

/**
 * Creates language models from Alumnium model settings using the registered
 * providers. Provider packages (`@alumnium/openai`, `@alumnium/anthropic`,
 * ...) register themselves when imported; `alumnium` imports all of them.
 */
export abstract class LlmFactory {
  static register(newProviders: LlmFactory.Providers): void {
    Object.assign(providers, newProviders);
  }

  static createLlm(model: Model): LanguageModelV4 {
    logger.info(
      `Creating LLM for model: ${model.provider}/${model.name} (timeout: ${MODEL_TIMEOUT_SEC}s, retries: ${MODEL_RETRIES})`,
    );

    const create = providers[model.provider];
    if (!create) {
      const pkg = PROVIDER_PACKAGES[model.provider];
      throw new Error(
        `No LLM provider registered for "${model.provider}". Install ${pkg} and import it (\`import "${pkg}";\`) or use the \`alumnium\` package which includes all providers.`,
      );
    }
    return create(model);
  }
}
