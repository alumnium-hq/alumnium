import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import z from "zod";
import { pythonicFormat } from "../../pythonic/pythonicFormat.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import type { LlmContext } from "../LlmContext.ts";
import { BaseAgent } from "./BaseAgent.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

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

export namespace AreaAgent {
  export type Meta = z.infer<typeof AreaAgent.Meta>;
}

export class AreaAgent extends BaseAgent {
  static Meta = z.object({
    kind: z.literal("area"),
    description: z.string(),
    treeXml: z.string(),
  });

  chain;

  constructor(llmContext: LlmContext, llm: BaseChatModel) {
    super(llmContext);
    this.chain = llm.withStructuredOutput(Area, { includeRaw: true });
  }

  @span("agent.invoke", { "agent.kind": "area" })
  async invoke(
    description: string,
    treeXml: string,
  ): Promise<{ id: number; explanation: string }> {
    logger.info("Starting area detection:");
    this.logData(logger, "in", {
      Description: description,
      "Accessibility tree": this.debugLogTreeDetail(treeXml),
    });

    const meta: AreaAgent.Meta = {
      kind: "area",
      description,
      treeXml,
    };

    const response = await this.invokeChain(
      this.chain,
      [
        ["system", this.prompts.system],
        [
          "user",
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

    return {
      id: (response.structured as Area).id,
      explanation: (response.structured as Area).explanation,
    };
  }
}
