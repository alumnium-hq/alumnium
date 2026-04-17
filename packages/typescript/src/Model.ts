import z from "zod";
import { getLogger } from "./utils/logger.ts";

const logger = getLogger(import.meta.url);

export namespace Model {
  export type Schema = z.infer<typeof Model.Schema>;

  export type Dev = z.infer<typeof Model.Dev>;

  export type Provider = z.infer<typeof Model.Provider>;
}

export class ModelName {
  static readonly DEFAULT: Record<Model.Provider, string> = {
    azure_foundry: "gpt-5-nano",
    azure_openai: "gpt-5-nano",
    anthropic: "claude-haiku-4-5-20251001",
    aws_anthropic: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    aws_meta: "us.meta.llama4-maverick-17b-instruct-v1:0",
    deepseek: "deepseek-reasoner",
    github: "gpt-4o-mini",
    google: "gemini-3.1-flash-lite-preview",
    mistralai: "mistral-medium-2505",
    ollama: "qwen3.6",
    openai: "gpt-5-nano-2025-08-07",
    xai: "grok-4-1-fast-reasoning",
  };
}

export class Model {
  static PROVIDERS = [
    "azure_foundry",
    "azure_openai",
    "anthropic",
    "aws_anthropic",
    "aws_meta",
    "deepseek",
    "github",
    "google",
    "mistralai",
    "ollama",
    "openai",
    "xai",
  ] as const;

  static Provider = z.enum(Model.PROVIDERS);

  static DEVS = [
    "anthropic",
    "google",
    "deepseek",
    "meta",
    "mistralai",
    "ollama",
    "xai",
    "openai",
  ] as const;

  static Dev = z.enum(Model.DEVS);

  static Schema = z.object({
    provider: Model.Provider,
    name: z.string(),
  });

  provider: Model.Provider;
  name: string;

  static #currentModel: Model | undefined;

  static get current(): Model {
    if (!this.#currentModel) this.#currentModel = this.initialize();
    return this.#currentModel;
  }

  constructor(provider?: Model.Provider | undefined, name?: string) {
    // If provider is not provided, use the current model setup
    if (!provider) {
      this.provider = Model.current.provider;
      this.name = Model.current.name;
      return;
    }

    // Apply model setup from arguments
    this.provider = provider;
    this.name = name || ModelName.DEFAULT[this.provider];
  }

  private static initialize() {
    const alumniumModel = process.env.ALUMNIUM_MODEL || "";
    if (alumniumModel) {
      logger.debug(`Initializing model from ALUMNIUM_MODEL: ${alumniumModel}`);
    } else {
      logger.debug(
        "ALUMNIUM_MODEL not set, using default model for environment",
      );
    }

    let [providerStr, name] = alumniumModel.toLowerCase().split("/");

    let provider: Model.Provider = "openai";
    if (providerStr) {
      provider = Model.Provider.parse(providerStr);
    } else if (process.env.GITHUB_ACTIONS) {
      provider = "github";
      name = ModelName.DEFAULT.github;
    }

    const model = new Model(provider, name);
    logger.debug(`Initialized current model ${model.provider}/${model.name}`);
    return model;
  }

  toString() {
    return `${this.provider}/${this.name}`;
  }

  static fromString(modelStr: string): Model {
    const [providerStr, name] = modelStr.toLowerCase().split("/");
    const provider = Model.Provider.parse(providerStr);
    return new Model(provider, name);
  }
}
