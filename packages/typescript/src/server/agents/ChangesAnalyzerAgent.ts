import z from "zod";
import type { LanguageModel } from "../../llm/LanguageModel.ts";
import type { Model } from "../../Model.ts";
import { pythonicFormat } from "../../pythonic/pythonicFormat.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import { BaseAgent } from "./BaseAgent.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export namespace ChangesAnalyzerAgent {
  export type Meta = z.infer<typeof ChangesAnalyzerAgent.Meta>;
}

export class ChangesAnalyzerAgent extends BaseAgent {
  static Meta = z.object({
    kind: z.literal("changes-analyzer"),
  });

  static readonly EXCLUDE_ATTRIBUTES = new Set(["id"]);
  constructor(model: Model, llm: LanguageModel) {
    super(model, llm);
  }

  @span("agent.invoke", { "agent.kind": "changes-analyzer" })
  async invoke(diff: string): Promise<string> {
    logger.info("Starting changes analysis:");
    logger.debug(this.formatLog("in", "Diff"), { detail: diff });

    const meta: ChangesAnalyzerAgent.Meta = {
      kind: "changes-analyzer",
    };

    const response = await this.invokeModel({
      instructions: this.prompts.system,
      messages: [
        {
          role: "user",
          content: pythonicFormat(this.prompts.user, { diff }),
        },
      ],
      meta,
    });

    const content = response.content.replaceAll("\n\n", " ");

    this.logData(logger, "out", {
      Result: content,
      Usage: response.usage,
    });

    return content;
  }
}
