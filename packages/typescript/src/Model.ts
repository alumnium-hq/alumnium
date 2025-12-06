export enum Provider {
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
    [Provider.AZURE_OPENAI]: "gpt-5-nano",
    [Provider.ANTHROPIC]: "claude-haiku-4-5-20251001",
    [Provider.AWS_ANTHROPIC]: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    [Provider.AWS_META]: "us.meta.llama4-maverick-17b-instruct-v1:0",
    [Provider.DEEPSEEK]: "deepseek-chat",
    [Provider.GITHUB]: "gpt-4o-mini",
    [Provider.GOOGLE]: "gemini-2.0-flash-001",
    [Provider.MISTRALAI]: "mistral-medium-2505",
    [Provider.OLLAMA]: "mistral-small3.1",
    [Provider.OPENAI]: "gpt-5-nano-2025-08-07",
    [Provider.XAI]: "grok-4-fast-non-reasoning",
  };
}

export class Model {
  provider: Provider;
  name: string;

  static current: Model;

  constructor(provider?: Provider | string, name?: string) {
    // Convert string to Provider enum if needed
    if (typeof provider === "string") {
      this.provider =
        Provider[provider.toUpperCase() as keyof typeof Provider] ||
        Provider.OPENAI;
    } else {
      this.provider = provider || Provider.OPENAI;
    }

    this.name = name || ModelName.DEFAULT[this.provider];
  }

  static initialize() {
    const alumniumModel = process.env.ALUMNIUM_MODEL || "";
    let [provider, name] = alumniumModel.toLowerCase().split("/");

    if (!provider && process.env.GITHUB_ACTIONS) {
      provider = "github";
      name = ModelName.DEFAULT[Provider.GITHUB];
    }

    Model.current = new Model(provider, name);
  }
}

// Initialize on module load
Model.initialize();
