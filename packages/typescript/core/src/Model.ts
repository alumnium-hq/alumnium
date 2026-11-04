import z from "zod";
import type { LanguageModel } from "./llm/LanguageModel.ts";

export namespace Model {
  export type Provider = z.infer<typeof ModelProvider>;

  export type Dev = z.infer<typeof ModelDev>;

  export interface WithProvider extends Model {
    createLlm(): LanguageModel;
  }

  export interface Builder {
    (name?: string): WithProvider;
    readonly provider: Provider;
  }

  export type Resolver = (model: Model) => WithProvider;
}

export interface Model {
  provider: Model.Provider;
  name: string;
}

const providers = [
  "anthropic",
  "aws",
  "azure",
  "codex",
  "cursor",
  "deepseek",
  "google",
  "meta",
  "mistralai",
  "ollama",
  "openai",
  "openrouter",
  "xai",
] as const;

const defaultModels: Record<Model.Provider, string> = {
  anthropic: "claude-haiku-5-5",
  aws: "us.openai.gpt-6-luna",
  azure: "gpt-6-luna",
  codex: "gpt-6-luna",
  cursor: "composer-2.5",
  deepseek: "deepseek-flash",
  google: "gemini-3.5-flash-lite",
  meta: "muse-spark-1.3-contributor",
  mistralai: "mistral-large-4",
  ollama: "qwen3.6",
  openai: "gpt-6-luna",
  openrouter: "openai/gpt-6-luna",
  xai: "grok-4.3",
};

const ModelProvider = z.enum(providers);

const bedrockRegionPrefix = /^(us|us-gov|eu|apac|jp|au|ca|global)\./;

const providerBuilders: Record<Model.Provider, [pkg: string, builder: string]> =
  {
    anthropic: ["@alumnium/anthropic", "anthropic"],
    aws: ["@alumnium/aws", "aws"],
    azure: ["@alumnium/azure", "azure"],
    codex: ["@alumnium/codex", "codex"],
    cursor: ["@alumnium/cursor", "cursor"],
    deepseek: ["@alumnium/deepseek", "deepseek"],
    google: ["@alumnium/google", "google"],
    meta: ["@alumnium/meta", "meta"],
    mistralai: ["@alumnium/mistral", "mistral"],
    ollama: ["@alumnium/ollama", "ollama"],
    openai: ["@alumnium/openai", "openai"],
    openrouter: ["@alumnium/openrouter", "openrouter"],
    xai: ["@alumnium/xai", "xai"],
  };

const devs = [
  "anthropic",
  "google",
  "deepseek",
  "mistralai",
  "ollama",
  "xai",
  "openai",
] as const;

const ModelDev = z.enum(devs);

export const defaultModelProvider: Model.Provider = "openai";

export const Model = {
  Provider: ModelProvider,

  Dev: ModelDev,

  new(providerStr: string, nameStr: string | undefined): Model {
    const provider = Model.Provider.parse(providerStr, { reportInput: true });
    const name = nameStr || Model.defaultProviderModel(provider);
    return { provider, name };
  },

  parse(modelStr: string): Model {
    // Split on the first "/" only: the provider is a single segment, but the
    // model name may itself contain slashes (e.g. OpenRouter ids like
    // "openrouter/openai/gpt-5"). A plain split("/") would drop everything after
    // the second segment and send a truncated model id to the provider.
    const slashIndex = modelStr.indexOf("/");
    const provider =
      slashIndex === -1 ? modelStr : modelStr.slice(0, slashIndex);
    const name = slashIndex === -1 ? undefined : modelStr.slice(slashIndex + 1);
    if (!provider) throw new Error(`Invalid model string: ${modelStr}`);
    return this.new(provider, name);
  },

  toString(modelId: Model): string {
    return `${modelId.provider}/${modelId.name}`;
  },

  defaultProviderModel(provider: Model.Provider): string {
    return defaultModels[provider];
  },

  /**
   * Returns the vendor of an Amazon Bedrock model id, e.g. "anthropic" for
   * "us.anthropic.claude-haiku-5-5" or "openai" for "openai.gpt-6-luna".
   */
  bedrockVendor(name: string): string {
    return name.replace(bedrockRegionPrefix, "").split(".")[0] ?? "";
  },

  builder(
    provider: Model.Provider,
    createLlm: (model: Model) => LanguageModel,
  ): Model.Builder {
    const build = (name?: string): Model.WithProvider => {
      const model = Model.new(provider, name);
      return { ...model, createLlm: () => createLlm(model) };
    };
    return Object.assign(build, { provider });
  },

  resolver(...modules: object[]): Model.Resolver {
    const builders = new Map<Model.Provider, Model.Builder>();
    for (const module of modules) {
      for (const value of Object.values(module)) {
        if (Model.isBuilder(value)) builders.set(value.provider, value);
      }
    }
    return (model) => {
      if (Model.hasProvider(model)) return model;
      const builder = builders.get(model.provider);
      if (!builder) throw Model.missingProviderError(model);
      return builder(model.name);
    };
  },

  isBuilder(value: unknown): value is Model.Builder {
    return (
      typeof value === "function" &&
      Model.Provider.safeParse((value as Partial<Model.Builder>).provider)
        .success
    );
  },

  hasProvider(model: Model): model is Model.WithProvider {
    return (
      typeof (model as Partial<Model.WithProvider>).createLlm === "function"
    );
  },

  missingProviderError(model: Model): Error {
    const [pkg, builder] = providerBuilders[model.provider];
    return new Error(
      `No LLM provider for model "${Model.toString(model)}". Pass the model built by its provider package, e.g. \`model: ${builder}("${model.name}")\` from "${pkg}", or use the \`alumnium\` package, which includes all providers.`,
    );
  },
};
