import { Runnable, RunnableConfig } from "@langchain/core/runnables";
import { Logger } from "@logtape/logtape";
import { always } from "alwaysly";
import { Model } from "../../Model.js";
import { getLogger } from "../../utils/logger.js";
import { retry } from "../../utils/retry.js";
import { Agent } from "./Agent.js";
// NOTE: While macros work well in Bun, it fails when using Alumium client from
// Node.js. A solution could be "node:sea" module, but current Bun version
// doesn't support it. For now, we bundle assets with scripts/generate.ts.
// import { loadAgentPrompts } from "./prompts/prompts.js" with { type: "macro" };
import { createLlmUsage, LlmUsage } from "../../llm/llmSchema.js";
import { agentPrompts } from "./prompts/bundledPrompts.js";
import {
  type AgentPrompts,
  agentClassNameToPromptsAgentId,
  PROVIDER_TO_PROMPTS_DEV,
} from "./prompts/prompts.js";

const logger = getLogger(import.meta.url);

// NOTE: See loadAgentPrompts import NOTE above.
// const agentPrompts = await loadAgentPrompts();

export class BaseAgentDebugLogDetail {
  constructor(public payload: unknown) {}
}

export namespace BaseAgentResponse {
  export interface Props {
    content: string;
    reasoning: string | null;
    structured: unknown;
    toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
    usage: Partial<LlmUsage>;
  }
}

/**
 * Common interface for LLM chain responses.
 *
 * Normalizes responses across providers (Anthropic, OpenAI, Google, etc.)
 * into a single structure with content, reasoning, structured output, and
 * tool calls.
 */
export class BaseAgentResponse {
  content: string;
  reasoning: string | null;
  structured: unknown;
  toolCalls: Array<{ name: string; args: Record<string, unknown> }>;
  usage: LlmUsage;

  constructor(props: BaseAgentResponse.Props) {
    this.content = props.content ?? "";
    this.reasoning = props.reasoning ?? null;
    this.structured = props.structured ?? null;
    this.toolCalls = props.toolCalls ?? [];
    this.usage = { ...createLlmUsage(), ...props.usage };
  }
}

export namespace BaseAgent {
  export type LogDir = "in" | "out";

  export type LogData = Record<string, LogDataValue>;

  export type LogDataValue = BaseAgentDebugLogDetail | unknown;
}

export class BaseAgent {
  #usage: LlmUsage = Agent.createUsage();
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
  ): Promise<BaseAgentResponse> {
    const result = await chain.invoke(input, options);

    let message: any;
    let structured: unknown = null;
    if (typeof result === "object" && result && "raw" in result) {
      message = result.raw;
      structured = (result as any).parsed;
    } else {
      message = result;
    }

    const reasoning = this.#extractReasoning(message.content);
    if (reasoning) {
      logger.info(this.formatLog("out", "Reasoning"), { detail: reasoning });
    }

    const usage: Partial<LlmUsage> = {};
    if (message.usage_metadata) {
      this.#updateUsage(message.usage_metadata);
      usage.input_tokens = message.usage_metadata.input_tokens ?? 0;
      usage.output_tokens = message.usage_metadata.output_tokens ?? 0;
      usage.total_tokens = message.usage_metadata.total_tokens ?? 0;
    }

    return new BaseAgentResponse({
      content: this.#extractText(message.content),
      reasoning,
      structured,
      toolCalls: message.tool_calls ?? [],
      usage,
    });
  }

  #extractReasoning(content: unknown): string | null {
    if (!Array.isArray(content) || !content.length) {
      return null;
    }

    const first = content[0];
    if (!first || typeof first !== "object") {
      return null;
    }

    if ("reasoning_content" in first) {
      // Anthropic
      return String(first["reasoning_content"]);
    } else if ("summary" in first && Array.isArray(first["summary"])) {
      // OpenAI
      return first["summary"]
        .map((entry) => {
          if (typeof entry === "object" && entry && "text" in entry) {
            return String(entry["text"]);
          }
          return "";
        })
        .join(" ");
    } else if ("thinking" in first) {
      // Google
      return String(first["thinking"]);
    }

    return null;
  }

  #extractText(content: unknown): string {
    if (typeof content === "string") {
      return content;
    }

    if (Array.isArray(content)) {
      const texts: string[] = [];
      for (const block of content) {
        if (typeof block === "string") {
          texts.push(block);
        } else if (
          typeof block === "object" &&
          block &&
          "type" in block &&
          block.type === "text" &&
          "text" in block
        ) {
          texts.push(String(block.text ?? ""));
        }
      }

      return texts.join("");
    }

    return String(content);
  }

  #updateUsage(usage: Partial<LlmUsage>) {
    this.#usage.input_tokens += usage.input_tokens ?? 0;
    this.#usage.output_tokens += usage.output_tokens ?? 0;
    this.#usage.total_tokens += usage.total_tokens ?? 0;
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
