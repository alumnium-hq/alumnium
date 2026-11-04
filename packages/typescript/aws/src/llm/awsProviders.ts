import { createAmazonBedrock } from "@ai-sdk/amazon-bedrock";
import type { JSONObject, LanguageModelV4 } from "@ai-sdk/provider";
import {
  usesAdaptiveThinking,
  withCallDefaults,
  Env,
  Logger,
  Model,
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
  const additionalModelRequestFields = vendorRequestFields(model.name);
  if (!additionalModelRequestFields) return llm;

  return withCallDefaults(llm, {
    providerOptions: { bedrock: { additionalModelRequestFields } },
  });
}

function vendorRequestFields(name: string): JSONObject | null {
  switch (Model.bedrockVendor(name)) {
    case "anthropic":
      return usesAdaptiveThinking(name)
        ? { thinking: { type: "adaptive" }, output_config: { effort: "low" } }
        : { thinking: { type: "enabled", budget_tokens: 1024 } };
    case "openai":
      // Bedrock SDK maps reasoning to the `reasoning_effort` field that GPT-5.6+
      // models reject, so pass the effort in the format they accept.
      return { reasoning: { effort: "low" } };
    default:
      return null;
  }
}

export const aws = Model.builder("aws", createAwsLlm);
