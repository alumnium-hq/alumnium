import { Logger, Model } from "@alumnium/core/internal";
import { CodexLanguageModel } from "./CodexLanguageModel.ts";

const logger = Logger.get(import.meta.url);

export const codex = Model.builder("codex", (model) => {
  logger.debug(`Creating Codex LLM with model ${model.name}`);
  return new CodexLanguageModel({ modelId: model.name });
});
