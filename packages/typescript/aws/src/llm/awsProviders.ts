import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import type { LanguageModelV4 } from "@ai-sdk/provider";
import {
  LlmFactory,
  usesAdaptiveThinking,
  withCallDefaults,
  Env,
  Logger,
  type Model,
} from "@alumnium/core/internal";

const logger = Logger.get(import.meta.url);

export function createAwsLlm(model: Model): LanguageModelV4 {
  logger.debug(`Creating AWS LLM with model ${model.name}`);
  const accessKeyId = Env.AWS_ACCESS_KEY;
  const secretAccessKey = Env.AWS_SECRET_KEY;
  const provider = createAmazonBedrock({
    region: Env.AWS_REGION_NAME,
    ...(accessKeyId && secretAccessKey ? { accessKeyId, secretAccessKey } : {}),
  });
  const llm = provider(model.name);
  if (model.provider !== "aws_anthropic") return llm;

  const additionalModelRequestFields = usesAdaptiveThinking(model.name)
    ? { thinking: { type: "adaptive" }, output_config: { effort: "low" } }
    : { thinking: { type: "enabled", budget_tokens: 1024 } };
  return withCallDefaults(llm, {
    providerOptions: { bedrock: { additionalModelRequestFields } },
  });
}

export const awsProviders: LlmFactory.Providers = {
  aws_anthropic: createAwsLlm,
  aws_meta: createAwsLlm,
};

LlmFactory.register(awsProviders);
