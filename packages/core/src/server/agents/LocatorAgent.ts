import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import z from "zod";
import { pythonicFormat } from "../../pythonic/pythonicFormat.js";
import { getLogger } from "../../utils/logger.js";
import { BaseAgent } from "./BaseAgent.js";

const logger = getLogger(import.meta.url);

/**
 * Element locator in the accessibility tree.
 */
export const Locator = z.object({
  explanation: z
    .string()
    .describe(
      "Explanation how the element was identified and why it matches the description. " +
        "Always include the description and the matching element in the explanation.",
    ),
  id: z
    .number()
    .describe(
      "Identifier of the element that matches the description in the accessibility tree.",
    ),
});

export type Locator = z.infer<typeof Locator>;

export class LocatorAgent extends BaseAgent {
  chain;

  constructor(llm: BaseChatModel) {
    super();
    this.chain = llm.withStructuredOutput(Locator, { includeRaw: true });
  }

  async invoke(
    description: string,
    accessibilityTreeXml: string,
  ): Promise<Array<{ id: number; explanation: string }>> {
    logger.info("Starting element location:");
    this.logData(logger, "in", {
      Description: description,
      "Accessibility tree": this.debugLogValue(accessibilityTreeXml),
    });

    const message = await this.invokeChain(this.chain, [
      ["system", this.prompts["system"]],
      [
        "human",
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

    return [message.parsed];
  }
}
