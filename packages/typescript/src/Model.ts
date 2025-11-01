export enum Provider {
  AZURE_OPENAI = "azure_openai",
  ANTHROPIC = "anthropic",
  AWS_ANTHROPIC = "aws_anthropic",
  AWS_META = "aws_meta",
  DEEPSEEK = "deepseek",
  GOOGLE = "google",
  MISTRALAI = "mistralai",
  OLLAMA = "ollama",
  OPENAI = "openai",
}

export class ModelName {
  static readonly DEFAULT: Record<Provider, string> = {
    [Provider.AZURE_OPENAI]: "gpt-4o-mini",
    [Provider.ANTHROPIC]: "claude-haiku-4-5-20251001",
    [Provider.AWS_ANTHROPIC]: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
    [Provider.AWS_META]: "us.meta.llama4-maverick-17b-instruct-v1:0",
    [Provider.DEEPSEEK]: "deepseek-chat",
    [Provider.GOOGLE]: "gemini-2.0-flash-001",
    [Provider.MISTRALAI]: "mistral-medium-2505",
    [Provider.OLLAMA]: "mistral-small3.1",
    [Provider.OPENAI]: "gpt-4o-mini-2024-07-18",
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
    const alumniumModel = process.env.ALUMNIUM_MODEL || "openai";
    const [provider, ...nameParts] = alumniumModel.toLowerCase().split("/");
    const name = nameParts.length > 0 ? nameParts[0] : undefined;

    Model.current = new Model(provider, name);
  }
}

// Initialize on module load
Model.initialize();
