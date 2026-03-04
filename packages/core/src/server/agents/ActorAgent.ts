import { ToolDefinition } from "@langchain/core/language_models/base";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AIMessageChunk, MessageStructure } from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Runnable } from "@langchain/core/runnables";
import { always } from "alwaysly";
import { ToolCall } from "../accessibility/BaseServerAccessibilityTree.js";
import { getLogger } from "../../utils/logger.js";
import { BaseAgent } from "./BaseAgent.js";

const logger = getLogger(import.meta.url);

export namespace ActorAgent {
  export interface ChainInput {
    goal: string;
    step: string;
    accessibility_tree: string;
  }

  export type ChainOutput = AIMessageChunk<MessageStructure>;

  export type InvokeResult = [string, ToolCall[]];
}

export class ActorAgent extends BaseAgent {
  chain: Runnable<ActorAgent.ChainInput, ActorAgent.ChainOutput>;

  constructor(llm: BaseChatModel, toolSchemas: ToolDefinition[]) {
    super();

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", this.prompts.system],
      ["human", this.prompts.user],
    ]);

    // TODO: Figure out when bindTools aren't available and maybe throw a proper
    // error or replace this comment with a NOTE comment instead.
    always(llm.bindTools);
    this.chain = prompt.pipe(llm.bindTools(toolSchemas));
  }

  async invoke(
    goal: string,
    step: string,
    accessibilityTreeXml: string,
  ): Promise<ActorAgent.InvokeResult> {
    if (!step.trim()) {
      return ["", []];
    }

    logger.info("Starting action:");
    this.logData(logger, "in", {
      Goal: goal,
      Step: step,
      "Accessibility tree": this.debugLogDetail(accessibilityTreeXml),
    });

    const response = await this.invokeChain(this.chain, {
      goal,
      step,
      accessibility_tree: accessibilityTreeXml,
    });

    this.logData(logger, "out", {
      Tools: response.toolCalls,
      Usage: response.usage,
    });

    return [response.reasoning ?? "", response.toolCalls];
  }
}
