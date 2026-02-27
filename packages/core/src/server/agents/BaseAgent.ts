import { BaseMessage } from "@langchain/core/messages";
import { Runnable, RunnableConfig } from "@langchain/core/runnables";
import { Logger } from "@logtape/logtape";
import { always } from "alwaysly";
import { Model } from "../../Model.js";
import { getLogger } from "../../utils/logger.js";
import { retry } from "../../utils/retry.js";
import { Usage } from "../serverSchema.js";
import { Agent } from "./Agent.js";
import { loadAgentPrompts } from "./prompts/prompts.js" with { type: "macro" };
import {
  type AgentPrompts,
  agentClassNameToPromptsAgentId,
  PROVIDER_TO_PROMPTS_DEV,
} from "./prompts/prompts.js";

const logger = getLogger(import.meta.url);

const agentPrompts = await loadAgentPrompts();

export class BaseAgentDebugLogDetail {
  constructor(public payload: unknown) {}
}

export namespace BaseAgent {
  export type LogDir = "in" | "out";

  export type LogData = Record<string, LogDataValue>;

  export type LogDataValue = BaseAgentDebugLogDetail | unknown;
}

export class BaseAgent {
  #usage: Usage = Agent.createUsage();
  protected prompts: AgentPrompts.RolePrompts;

  constructor() {
    const dev = PROVIDER_TO_PROMPTS_DEV[Model.current.provider];
    const prompts =
      agentPrompts[agentClassNameToPromptsAgentId(this.constructor.name)]?.[
        dev
      ];
    always(prompts);
    this.prompts = prompts;
  }

  // TODO: It would be better if we reversed the function (shouldRetry).
  protected static shouldRaise(error: unknown): boolean {
    if (!(error instanceof Error)) return true;

    // Common API rate limit errors
    const isCommonRateLimitError =
      error.name === "RateLimitError" ||
      error.constructor.name === "RateLimitError";

    // AWS Bedrock rate limit errors
    const isAwsRateLimitError =
      "response" in error &&
      typeof error.response === "object" &&
      error.response &&
      "Error" in error.response &&
      typeof error.response["Error"] === "object" &&
      error.response["Error"] &&
      "Code" in error.response["Error"] &&
      error.response["Error"]["Code"] === "ThrottlingException";

    // Google rate limit errors
    const isGoogleRateLimitError = "code" in error && error.code === 429;

    // MistralAI rate limit errors
    const isMistralRateLimitError =
      "response" in error &&
      // @ts-expect-error -- TODO: Missing Python API
      error.response.status_code === 429;

    const isDeepSeekRateLimitError =
      error.name === "InternalServerError" ||
      error.constructor.name === "InternalServerError";

    const isRateLimitError =
      isCommonRateLimitError ||
      isAwsRateLimitError ||
      isGoogleRateLimitError ||
      isMistralRateLimitError ||
      isDeepSeekRateLimitError;

    return !isRateLimitError;
  }

  @retry({
    maxAttempts: 8,
    backOff: 2000,
    doRetry: (error) => !BaseAgent.shouldRaise(error),
  })
  // TODO: This function is infested with bad types, figure out a better way
  // or simply replace LangChain with AI SDK or custom code.
  protected async invokeChain<
    RunInput = any,
    RunOutput = any,
    CallOptions extends RunnableConfig = RunnableConfig,
  >(
    chain: Runnable<RunInput, RunOutput, CallOptions>,
    input: RunInput,
    options?: Partial<CallOptions>,
  ) {
    const result = await chain.invoke(input, options);
    let content: unknown;
    if (typeof result === "object" && result && "raw" in result) {
      const raw = result.raw as any;
      content = raw.content;
      this.#updateUsage(raw.usage_metadata);
    } else {
      content = (result as any).content;
      this.#updateUsage((result as any).usage_metadata);
    }

    if (Array.isArray(content) && content[0]) {
      if ("reasoning_content" in content[0]) {
        // Anthropic reasoning
        logger.info(`  <- Reasoning: ${content[0]["reasoning_content"]}`);
      } else if ("summary" in content[0]) {
        // OpenAI reasoning
        for (const summary of content[0]["summary"]) {
          logger.info(`  <- Reasoning: ${summary["text"]}`);
        }
      } else if ("thinking" in content[0]) {
        // Google reasoning
        logger.info(`  <- Reasoning: ${content[0]["thinking"]}`);
      }
    }

    return result;
  }

  #updateUsage(usage: Partial<Usage> | undefined | null) {
    if (!usage) return;
    this.#usage.input_tokens += usage.input_tokens ?? 0;
    this.#usage.output_tokens += usage.output_tokens ?? 0;
    this.#usage.total_tokens += usage.total_tokens ?? 0;
  }

  protected static getMessageUsage(message: BaseMessage) {
    return "usage_metadata" in message && message.usage_metadata;
  }

  protected formatLog(dir: BaseAgent.LogDir, topic: string) {
    return `  ${dir === "in" ? "->" : "<-"} ${topic}: {detail}`;
  }

  protected logData(
    logger: Logger,
    dir: BaseAgent.LogDir,
    data: BaseAgent.LogData,
  ) {
    for (const [key, value] of Object.entries(data)) {
      const message = this.formatLog(dir, key);
      const level = value instanceof BaseAgentDebugLogDetail ? "debug" : "info";
      const detail =
        value instanceof BaseAgentDebugLogDetail ? value.payload : value;
      logger[level](message, { detail });
    }
  }

  protected debugLogDetail(value: unknown): BaseAgentDebugLogDetail {
    return new BaseAgentDebugLogDetail(value);
  }

  //#region Agent state

  toState(): Agent.State {
    // Note that most of the agents don't have any internal state beyond usage,
    // except for the planner agent which has examples.
    return { usage: this.#usage };
  }

  applyState(state: Agent.State): void {
    this.#usage = state.usage;
  }

  //#endregion
}
