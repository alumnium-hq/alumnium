import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import z from "zod";
import { pythonicFormat } from "../../pythonic/pythonicFormat.js";
import { getLogger } from "../../utils/logger.js";
import { BaseAgent } from "./BaseAgent.js";

const logger = getLogger(import.meta.path);

/**
 * Area of the accessibility tree to use.
 */
export const Area = z.object({
  explanation: z
    .string()
    .describe(
      "Explanation how the area was determined and why it's related to the requested information. " +
        "Always include the requested information and its value in the explanation.",
    ),
  id: z
    .number()
    .describe(
      "Identifier of the element that corresponds to the area in the accessibility tree.",
    ),
});

export type Area = z.infer<typeof Area>;

export class AreaAgent extends BaseAgent {
  chain;

  constructor(llm: BaseChatModel) {
    super();
    this.chain = llm.withStructuredOutput(Area, { includeRaw: true });
  }

  async invoke(
    description: string,
    accessibilityTreeXml: string,
  ): Promise<{ id: number; explanation: string }> {
    logger.info("Starting area detection:");
    this.logData(logger, "in", {
      Description: description,
      "Accessibility tree": this.debugLogValue(accessibilityTreeXml),
    });

    const message = await this.invokeChain(this.chain, [
      ["system", this.prompts.system],
      [
        "user",
        pythonicFormat(this.prompts.user, {
          accessibility_tree: accessibilityTreeXml,
          description,
        }),
      ],
    ]);

    this.logData(logger, "out", {
      Result: message.parsed,
      Usage: BaseAgent.getMessageUsage(message.raw),
    });

    return message.parsed;
  }
}
