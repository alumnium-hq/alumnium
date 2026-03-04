import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { pythonicFormat } from "../../pythonic/pythonicFormat.js";
import { getLogger } from "../../utils/logger.js";
import { BaseAgent } from "./BaseAgent.js";

const logger = getLogger(import.meta.url);

export class ChangesAnalyzerAgent extends BaseAgent {
  llm: BaseChatModel;

  constructor(llm: BaseChatModel) {
    super();
    this.llm = llm;
  }

  async invoke(diff: string): Promise<string> {
    logger.info("Starting changes analysis:");
    logger.debug(this.formatLog("in", "Diff"), { detail: diff });

    const response = await this.invokeChain(this.llm, [
      ["system", this.prompts.system],
      ["human", pythonicFormat(this.prompts.user, { diff })],
    ]);

    const content = response.content.replace("\n\n", " ");

    this.logData(logger, "out", {
      Result: content,
      Usage: response.usage,
    });

    return content;
  }
}
