import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
} from "@ai-sdk/provider";

// Helpers shared by the LLM provider packages (`@alumnium/openai`,
// `@alumnium/anthropic`, ...).

export type LlmCallDefaults = Pick<
  Partial<LanguageModelV4CallOptions>,
  "temperature" | "reasoning" | "providerOptions"
>;

/**
 * Wraps a model to apply call option defaults unless a call sets them, and to
 * drop options the model doesn't support.
 */
export function withCallDefaults(
  model: LanguageModelV4,
  defaults: LlmCallDefaults | undefined,
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

export function apiKeyField(
  apiKey: string | undefined,
): { apiKey: string } | object {
  return apiKey ? { apiKey } : {};
}

export function requiredEnv(
  name: string,
  value: string | undefined,
  provider: string,
): string {
  if (!value) {
    throw new Error(
      `${name} environment variable is required for ${provider} models`,
    );
  }
  return value;
}

/** Whether a Claude model uses adaptive thinking (Claude 4.6+). */
export function usesAdaptiveThinking(modelName: string): boolean {
  const match = modelName.match(/claude-[a-z]+-(\d+)(?:-(\d{1,2})(?!\d))?/);
  if (!match) return false;

  const major = Number(match[1]);
  const minor = match[2] ? Number(match[2]) : 0;
  return major > 4 || (major === 4 && minor >= 6);
}
