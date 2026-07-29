import type { ToolDefinition } from "@langchain/core/language_models/base";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  AIMessageChunk,
  type MessageStructure,
} from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Runnable } from "@langchain/core/runnables";
import { always } from "alwaysly";
import z from "zod";
import { Params } from "../../Params.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import type { ToolCall } from "../accessibility/BaseServerAccessibilityTree.ts";
import type { LlmContext } from "../LlmContext.ts";
import { BaseAgent } from "./BaseAgent.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export namespace ActorAgent {
  export interface ChainInput {
    goal: string;
    step: string;
    accessibility_tree: string;
  }

  export type ChainOutput = AIMessageChunk<MessageStructure>;

  export type InvokeResult = [string, ToolCall[]];

  export type Meta = z.infer<typeof ActorAgent.Meta>;
}

export class ActorAgent extends BaseAgent {
  static Meta = z.object({
    kind: z.literal("actor"),
    goal: BaseAgent.Goal,
    step: BaseAgent.Step,
    treeXml: z.string(),
    // NOTE: `goal` and `step` stay in their placeholder form here, since the
    // meta is the cache identity. The values live alongside them so that the
    // elements cache can mask them out of what it stores and substitute fresh
    // ones back in on a hit.
    params: z.record(z.string(), z.string()).optional(),
  });

  chain: Runnable<ActorAgent.ChainInput, ActorAgent.ChainOutput>;

  constructor(
    llmContext: LlmContext,
    llm: BaseChatModel,
    toolSchemas: ToolDefinition[],
  ) {
    super(llmContext);

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", this.prompts.system],
      ["human", this.prompts.user],
    ]);

    // TODO: Figure out when bindTools aren't available and maybe throw a proper
    // error or replace this comment with a NOTE comment instead.
    // oxlint-disable-next-line typescript/unbound-method -- TODO: File an issue to the rule suggesting ignore pattern
    always(llm.bindTools);
    this.chain = prompt.pipe(llm.bindTools(toolSchemas));
  }

  @span("agent.invoke", { "agent.kind": "actor" })
  async invoke(
    goal: string,
    step: string,
    treeXml: string,
    paramValues?: Record<string, string> | undefined,
  ): Promise<ActorAgent.InvokeResult> {
    if (!step.trim()) {
      return ["", []];
    }

    const params = Params.from(paramValues);

    // NOTE: The model is given the real values, so that it can pick an element
    // by one of them (e.g. "click 8 button"). Only the cache identity below
    // keeps the placeholders.
    const substitutedGoal = params.substitute(goal);
    const substitutedStep = params.substitute(step);

    logger.info("Starting action:");
    this.logData(logger, "in", {
      Goal: substitutedGoal,
      Step: substitutedStep,
      "Accessibility tree": this.debugLogTreeDetail(treeXml),
    });

    const meta: ActorAgent.Meta = {
      kind: "actor",
      goal: goal as BaseAgent.Goal,
      step: step as BaseAgent.Step,
      treeXml,
      ...(paramValues ? { params: paramValues } : {}),
    };

    const response = await this.invokeChain(
      this.chain,
      {
        goal: substitutedGoal,
        step: substitutedStep,
        accessibility_tree: treeXml,
      },
      meta,
    );

    this.logData(logger, "out", {
      Tools: response.toolCalls,
      Usage: response.usage,
    });

    return [response.reasoning ?? "", response.toolCalls];
  }
}
