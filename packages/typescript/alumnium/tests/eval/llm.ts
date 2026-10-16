import type { LanguageModel, Model } from "@alumnium/core/internal";
import { resolveModel } from "../../src/models.ts";

export function createEvalLlm(model: Model): LanguageModel {
  return resolveModel(model).createLlm();
}
