import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import z from "zod";
import { pythonicFormat } from "../../pythonic/pythonicFormat.js";
import { getLogger } from "../../utils/logger.js";
import type { LlmContext } from "../LlmContext.js";
import { BaseAgent } from "./BaseAgent.js";

const logger = getLogger(import.meta.url);

export namespace ChangesAnalyzerAgent {
  export type Meta = z.infer<typeof ChangesAnalyzerAgent.Meta>;
}

export class ChangesAnalyzerAgent extends BaseAgent {
  static Meta = z.object({
    kind: z.literal("changes-analyzer"),
  });

  static readonly EXCLUDE_ATTRIBUTES = new Set(["id"]);
  llm: BaseChatModel;

  constructor(llmContext: LlmContext, llm: BaseChatModel) {
    super(llmContext);
    this.llm = llm;
  }

  async invoke(diff: string): Promise<string> {
    logger.info("Starting changes analysis:");
    logger.debug(this.formatLog("in", "Diff"), { detail: diff });

    const meta: ChangesAnalyzerAgent.Meta = {
      kind: "changes-analyzer",
    };

    const response = await this.invokeChain(
      this.llm,
      [
        ["system", this.prompts.system],
        ["human", pythonicFormat(this.prompts.user, { diff })],
      ],
      meta,
    );

    const content = response.content.replaceAll("\n\n", " ");

    this.logData(logger, "out", {
      Result: content,
      Usage: response.usage,
    });

    return content;
  }
}
