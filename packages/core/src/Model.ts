import z from "zod";
import { getLogger } from "./utils/logger.js";

const logger = getLogger(import.meta.url);

export enum Provider {
  AZURE_FOUNDRY = "azure_foundry",
  AZURE_OPENAI = "azure_openai",
  ANTHROPIC = "anthropic",
  AWS_ANTHROPIC = "aws_anthropic",
  AWS_META = "aws_meta",
  DEEPSEEK = "deepseek",
  GITHUB = "github",
  GOOGLE = "google",
  MISTRALAI = "mistralai",
  OLLAMA = "ollama",
  OPENAI = "openai",
  XAI = "xai",
}

export class ModelName {
  static readonly DEFAULT: Record<Provider, string> = {
    [Provider.AZURE_FOUNDRY]: "gpt-5-nano",
    [Provider.AZURE_OPENAI]: "gpt-5-nano",
    [Provider.ANTHROPIC]: "claude-haiku-4-5-20251001",
    [Provider.AWS_ANTHROPIC]: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    [Provider.AWS_META]: "us.meta.llama4-maverick-17b-instruct-v1:0",
    [Provider.DEEPSEEK]: "deepseek-reasoner",
    [Provider.GITHUB]: "gpt-4o-mini",
    [Provider.GOOGLE]: "gemini-3.1-flash-lite-preview",
    [Provider.MISTRALAI]: "mistral-medium-2505",
    [Provider.OLLAMA]: "mistral-small3.1",
    [Provider.OPENAI]: "gpt-5-nano-2025-08-07",
    [Provider.XAI]: "grok-4-1-fast-reasoning",
  };
}

let currentModel: Model | undefined;

export class Model {
  provider: Provider;
  name: string;

  static get current(): Model {
    if (!currentModel) currentModel = Model.initialize();
    return currentModel;
  }

  constructor(provider?: Provider | string, name?: string) {
    // Convert string to Provider enum if needed
    this.provider =
      (provider && Provider[provider.toUpperCase() as keyof typeof Provider]) ||
      Provider.OPENAI;

    this.name = name || ModelName.DEFAULT[this.provider];
  }

  private static initialize() {
    const alumniumModel = process.env.ALUMNIUM_MODEL || "";
    let [provider, name] = alumniumModel.toLowerCase().split("/");

    if (!provider && process.env.GITHUB_ACTIONS) {
      provider = "github";
      name = ModelName.DEFAULT[Provider.GITHUB];
    }

    const model = new Model(provider, name);
    logger.debug(`Initialized current model ${model.provider}/${model.name}`);
    return model;
  }

  toString() {
    return `${this.provider}/${this.name}`;
  }

  //#region State

  toState(): Model.Schema {
    return {
      provider: this.provider,
      name: this.name,
    };
  }

  static fromState(state: Model.Schema): Model {
    return new Model(state.provider, state.name);
  }

  //#endregion
}

export namespace Model {
  export const Schema = z.object({
    provider: z.enum(Provider),
    name: z.string(),
  });

  export type Schema = z.infer<typeof Schema>;
}

export type Dev = (typeof DEVS)[number];

export const DEVS = [
  "anthropic",
  "google",
  "deepseek",
  "meta",
  "mistralai",
  "ollama",
  "xai",
  "openai",
] as const;
