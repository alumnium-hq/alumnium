import { dynamicTool, jsonSchema, type ModelMessage, type ToolSet } from "ai";
import z from "zod";
import type { Model } from "../../Model.ts";
import type { LanguageModel } from "../../llm/LanguageModel.ts";
import { pythonicFormat } from "../../pythonic/pythonicFormat.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import type { ToolCall } from "../../tools/BaseTool.ts";
import type { ToolDefinition } from "../../tools/ToolDefinition.ts";
import { BaseAgent } from "./BaseAgent.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export namespace ActorAgent {
  export type InvokeResult = [string, ToolCall[]];

  export type Meta = z.infer<typeof ActorAgent.Meta>;
}

export class ActorAgent extends BaseAgent {
  static Meta = z.object({
    kind: z.literal("actor"),
    goal: BaseAgent.Goal,
    step: BaseAgent.Step,
    treeXml: z.string(),
  });

  tools: ToolSet;

  constructor(model: Model, llm: LanguageModel, toolSchemas: ToolDefinition[]) {
    super(model, llm);
    this.tools = Object.fromEntries(
      toolSchemas.map((tool) => [
        tool.function.name,
        dynamicTool({
          description: tool.function.description,
          inputSchema: jsonSchema(tool.function.parameters),
        }),
      ]),
    );
  }

  @span("agent.invoke", { "agent.kind": "actor" })
  async invoke(
    goal: string,
    step: string,
    treeXml: string,
    screenshot?: string,
  ): Promise<ActorAgent.InvokeResult> {
    if (!step.trim()) {
      return ["", []];
    }

    logger.info("Starting action:");
    this.logData(logger, "in", {
      Goal: goal,
      Step: step,
      "Accessibility tree": this.debugLogTreeDetail(treeXml),
    });

    const meta: ActorAgent.Meta = {
      kind: "actor",
      goal: goal as BaseAgent.Goal,
      step: step as BaseAgent.Step,
      treeXml,
    };

    const prompt = pythonicFormat(this.prompts.user, {
      goal,
      step,
      accessibility_tree: treeXml,
    });
    const content: Extract<ModelMessage, { role: "user" }>["content"] =
      screenshot
        ? [
            { type: "text", text: prompt },
            { type: "file", mediaType: "image/png", data: screenshot },
          ]
        : prompt;

    const response = await this.invokeModel({
      instructions: this.prompts.system,
      messages: [{ role: "user", content }],
      tools: this.tools,
      meta,
    });

    this.logData(logger, "out", {
      Tools: response.toolCalls,
      Usage: response.usage,
    });

    return [response.reasoning ?? "", response.toolCalls];
  }
}
