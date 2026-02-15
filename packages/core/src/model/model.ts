import { z } from "zod";

export const providers = [
  "azure_openai",
  "azure_foundry",
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

export type Provider = (typeof providers)[number];

export const defaultProviderModels: Record<Provider, string> = {
  azure_foundry: "gpt-5-nano", // 2025-08-07
  azure_openai: "gpt-5-nano", // 2025-08-07
  anthropic: "claude-haiku-4-5-20251001",
  aws_anthropic: "us.anthropic.claude-haiku-4-5-20251001-v1:0",
  aws_meta: "us.meta.llama4-maverick-17b-instruct-v1:0",
  deepseek: "deepseek-reasoner",
  github: "gpt-4o-mini",
  google: "gemini-3-flash-preview",
  mistralai: "mistral-medium-2505",
  ollama: "mistral-small3.1",
  openai: "gpt-5-nano-2025-08-07",
  xai: "grok-4-1-fast-reasoning",
};

export const Model = z.object({
  provider: z.enum(providers),
  name: z.string(),
});

export type Model = z.infer<typeof Model>;

export namespace EnsureModelName {
  export interface Props {
    provider: Provider;
    name?: string | undefined;
  }
}

export function ensureModelName(props: EnsureModelName.Props): Model {
  return {
    provider: props.provider,
    name: props.name || defaultProviderModels[props.provider],
  };
}
