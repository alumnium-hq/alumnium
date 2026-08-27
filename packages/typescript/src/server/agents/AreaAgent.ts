import { Output } from "ai";
import z from "zod";
import type { Model } from "../../Model.ts";
import type { LanguageModel } from "../../llm/LanguageModel.ts";
import { pythonicFormat } from "../../pythonic/pythonicFormat.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
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

  constructor(model: Model, llm: LanguageModel) {
    super(model, llm);
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

    const response = await this.invokeModel({
      instructions: this.prompts.system,
      messages: [
        {
          role: "user",
          content: pythonicFormat(this.prompts.user, {
            accessibility_tree: treeXml,
            description,
          }),
        },
      ],
      output: Output.object({ schema: Area }),
      meta,
    });

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
