import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { pythonicFormat } from "../../pythonic/pythonicFormat.js";
import { getLogger } from "../../utils/logger.js";
import { BaseAgent } from "./BaseAgent.js";

const logger = getLogger(import.meta.path);

export class ChangesAnalyzerAgent extends BaseAgent {
  llm: BaseChatModel;

  constructor(llm: BaseChatModel) {
    super();
    this.llm = llm;
  }

  async invoke(diff: string): Promise<string> {
    logger.info("Starting changes analysis:");
    logger.debug(`  -> Diff: ${diff}`);

    const message = await this.invokeChain(this.llm, [
      ["system", this.prompts["system"]],
      ["human", pythonicFormat(this.prompts.user, { diff })],
    ]);

    const content = message.text.replace("\n\n", " ");
    logger.info(`  <- Result: ${content}`);
    logger.info(
      `  <- Usage: ${(message as { usage_metadata: unknown }).usage_metadata}`,
    );

    return content;
  }
}
