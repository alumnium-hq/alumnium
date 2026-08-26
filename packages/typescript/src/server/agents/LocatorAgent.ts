import { Output } from "ai";
import z from "zod";
import type { Model } from "../../Model.ts";
import type { LanguageModel } from "../../llm/LanguageModel.ts";
import { pythonicFormat } from "../../pythonic/pythonicFormat.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import type { ElementRef } from "../serverSchema.ts";
import { BaseAgent } from "./BaseAgent.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

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

  constructor(model: Model, llm: LanguageModel) {
    super(model, llm);
  }

  @span("agent.invoke", { "agent.kind": "locator" })
  async invoke(
    description: string,
    treeXml: string,
  ): Promise<Array<ElementRef>> {
    logger.info("Starting element location:");
    this.logData(logger, "in", {
      Description: description,
      "Accessibility tree": this.debugLogTreeDetail(treeXml),
    });

    const meta: LocatorAgent.Meta = {
      kind: "locator",
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
      output: Output.object({ schema: Locator }),
      meta,
    });

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
