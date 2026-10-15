import {
  Env,
  isSingleFileExecutable,
  Logger,
  maskString,
  LlmFactory,
} from "@alumnium/core/internal";
import { loadVendoredCursorSdk } from "../standalone/installCursorSdk.ts";
import { CursorLanguageModel } from "./CursorLanguageModel.ts";

const logger = Logger.get(import.meta.url);

export const cursorProviders: LlmFactory.Providers = {
  cursor: (model) => {
    logger.debug(`Creating Cursor LLM with model ${model.name}`);
    const apiKey = Env.CURSOR_API_KEY;
    if (apiKey) logger.debug(`Cursor API Key is set: ${maskString(apiKey)}`);
    return new CursorLanguageModel({
      modelId: model.name,
      ...(apiKey ? { apiKey } : {}),
      ...(isSingleFileExecutable() ? { sdkLoader: loadVendoredCursorSdk } : {}),
    });
  },
};

LlmFactory.register(cursorProviders);
