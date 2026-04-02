import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import z from "zod";
import { pythonicFormat } from "../../pythonic/pythonicFormat.ts";
import { getLogger } from "../../utils/logger.ts";
import type { LlmContext } from "../LlmContext.ts";
import type { ElementRef } from "../serverSchema.ts";
import { BaseAgent } from "./BaseAgent.ts";

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

export namespace LocatorAgent {
  export type Meta = z.infer<typeof LocatorAgent.Meta>;
}

export class LocatorAgent extends BaseAgent {
  static Meta = z.object({
    kind: z.literal("locator"),
    description: z.string(),
    treeXml: z.string(),
  });

  chain;

  constructor(llmContext: LlmContext, llm: BaseChatModel) {
    super(llmContext);
    this.chain = llm.withStructuredOutput(Locator, { includeRaw: true });
  }

  async invoke(
    description: string,
    treeXml: string,
  ): Promise<Array<ElementRef>> {
    logger.info("Starting element location:");
    this.logData(logger, "in", {
      Description: description,
      "Accessibility tree": this.debugLogDetail(treeXml),
    });

    const meta: LocatorAgent.Meta = {
      kind: "locator",
      description,
      treeXml,
    };

    const response = await this.invokeChain(
      this.chain,
      [
        ["system", this.prompts["system"]],
        [
          "human",
          pythonicFormat(this.prompts.user, {
            accessibility_tree: treeXml,
            description,
          }),
        ],
      ],
      meta,
    );

    this.logData(logger, "out", {
      Result: response.structured,
      Usage: response.usage,
    });

    return [
      {
        id: (response.structured as Locator).id,
        explanation: (response.structured as Locator).explanation,
      },
    ];
  }
}
