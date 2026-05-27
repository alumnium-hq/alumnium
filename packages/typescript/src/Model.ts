import z from "zod";

export namespace Model {
  export type Provider = z.infer<typeof ModelProvider>;

  export type Dev = z.infer<typeof ModelDev>;
}

export interface Model {
  provider: Model.Provider;
  name: string;
}

const providers = [
  "azure_foundry",
  "azure_openai",
  "anthropic",
  "aws_anthropic",
  "aws_meta",
  "codex",
  "deepseek",
  "github",
  "google",
  "mistralai",
  "ollama",
  "openai",
  "xai",
] as const;

const defaultModels: Record<Model.Provider, string> = {
  azure_foundry: "gpt-5-nano",
  azure_openai: "gpt-5-nano",
  anthropic: "claude-haiku-4-5-20251001",
  aws_anthropic: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  aws_meta: "us.meta.llama4-maverick-17b-instruct-v1:0",
  codex: "gpt-5.4-mini",
  deepseek: "deepseek-reasoner",
  github: "gpt-4o-mini",
  google: "gemini-3.1-flash-lite",
  mistralai: "mistral-medium-2505",
  ollama: "qwen3.6",
  openai: "gpt-5-nano-2025-08-07",
  xai: "grok-4-1-fast-reasoning",
};

const ModelProvider = z.enum(providers);

const devs = [
  "anthropic",
  "google",
  "deepseek",
  "meta",
  "mistralai",
  "ollama",
  "xai",
  "openai",
] as const;

const ModelDev = z.enum(devs);

export const Model = {
  Provider: ModelProvider,

  Dev: ModelDev,

  new(
    providerStr: string | Model.Provider,
    nameStr: string | undefined,
  ): Model {
    const provider = Model.Provider.parse(providerStr, { reportInput: true });
    const name = nameStr || Model.defaultProviderModel(provider);
    return { provider, name };
  },

  parse(modelStr: string): Model {
    const [provider, name] = modelStr.split("/");
    if (!provider) throw new Error(`Invalid model string: ${modelStr}`);
    return this.new(provider, name);
  },

  toString(modelId: Model): string {
    return `${modelId.provider}/${modelId.name}`;
  },

  defaultProviderModel(provider: Model.Provider): string {
    return defaultModels[provider];
  },
};
