import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  AIMessageChunk,
  MessageStructure,
  MessageToolSet,
} from "@langchain/core/messages";
import { ChatPromptTemplate } from "@langchain/core/prompts";
import { Runnable } from "@langchain/core/runnables";
import { always } from "alwaysly";
import { ToolClass } from "../../tools/BaseTool.js";
import { convertToolsToSchemas } from "../../tools/toolToSchemaConverter.js";
import { getLogger } from "../../utils/logger.js";
import { BaseAgent } from "./BaseAgent.js";

const logger = getLogger(import.meta.path);

export namespace ActorAgent {
  export type Input = {
    goal: string;
    step: string;
    accessibility_tree: string;
  };

  export type Output = AIMessageChunk<MessageStructure<MessageToolSet>>;
}

export class ActorAgent extends BaseAgent {
  chain: Runnable<ActorAgent.Input, ActorAgent.Output>;

  constructor(llm: BaseChatModel, tools: Record<string, ToolClass>) {
    super();

    const prompt = ChatPromptTemplate.fromMessages([
      ["system", this.prompts.system],
      ["human", this.prompts.user],
    ]);

    // TODO: Figure out when bindTools aren't available and maybe throw a proper
    // error or replace this comment with a NOTE comment instead.
    always(llm.bindTools);
    this.chain = prompt.pipe(llm.bindTools!(convertToolsToSchemas(tools)));
  }

  async invoke(goal: string, step: string, accessibilityTreeXml: string) {
    if (!step.trim()) {
      return;
    }

    logger.info("Starting action:");
    logger.info(`  -> Goal: ${goal}`);
    logger.info(`  -> Step: ${step}`);
    logger.debug(`  -> Accessibility tree: ${accessibilityTreeXml}`);

    const message = await this.invokeChain(this.chain, {
      goal,
      step,
      accessibility_tree: accessibilityTreeXml,
    });

    logger.info(`  <- Tools: ${message.tool_calls}`);
    logger.info(`  <- Usage: ${message.usage_metadata}`);

    // Return tool calls for the client to execute
    return message.tool_calls;
  }
}
