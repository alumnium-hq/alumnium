import { Runnable, type RunnableConfig } from "@langchain/core/runnables";
import { always } from "alwaysly";
import {
  getLogger,
  optionalLogDebugExtra,
  type LoggerLike,
} from "../../utils/logger.ts";
// NOTE: While macros work well in Bun, it fails when using Alumium client from
// Node.js. A solution could be "node:sea" module, but current Bun version
// doesn't support it. For now, we bundle assets with scripts/generate.ts.
// import { loadAgentPrompts } from "./prompts/prompts.js" with { type: "macro" };
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import z from "zod";
import { createLlmUsage, LlmUsage } from "../../llm/llmSchema.ts";
import { retry } from "../../utils/retry.ts";
import { LlmContext } from "../LlmContext.ts";
import { MODEL_RETRIES, MODEL_TIMEOUT_SEC } from "../LlmFactory.ts";
import { agentPrompts } from "./prompts/bundledPrompts.ts";
import {
  agentClassNameToPromptsAgentKind,
  PROVIDER_TO_PROMPTS_DEV,
  type AgentPrompts,
} from "./prompts/prompts.ts";
import type { AIMessage } from "@langchain/core/messages";

const logger = getLogger(import.meta.url);

const convertInputToPromptValue =
  // @ts-expect-error -- It is marked as protected in BaseAgent, but we need to call it from
  // invokeChain callbacks to provide meta data for caching.
  BaseChatModel._convertInputToPromptValue.bind(BaseChatModel);

// NOTE: See loadAgentPrompts import NOTE above.
// const agentPrompts = await loadAgentPrompts();

export class BaseAgentDebugLogDetail {
  payload: unknown;
  constructor(payload: unknown) {
    this.payload = payload;
  }
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

  export type LogData = Record<string, unknown>;

  export type Goal = z.infer<typeof BaseAgent.Goal>;

  export type Step = z.infer<typeof BaseAgent.Step>;
}

export class BaseAgent {
  static Goal = z.string().brand("BaseAgent.Goal");

  static Step = z.string().brand("BaseAgent.Step");

  #llmContext: LlmContext;
  usage: LlmUsage = createLlmUsage();
  protected prompts: AgentPrompts.RolePrompts;

  constructor(llmContext: LlmContext) {
    this.#llmContext = llmContext;

    const dev = PROVIDER_TO_PROMPTS_DEV[llmContext.model.provider];
    const agentPromptsByDev =
      agentPrompts[agentClassNameToPromptsAgentKind(this.constructor.name)];
    const prompts = agentPromptsByDev[dev] ?? agentPromptsByDev.openai;
    always(prompts);
    this.prompts = prompts;
  }

  protected static shouldRetry(this: void, error: unknown): boolean {
    logger.debug("Got error from LLM chain: {error}", { error });

    if (!(error instanceof Error)) {
      logger.debug(
        "  -> Error is not an instance of Error, re-raising without retrying.",
      );
      return false;
    }

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

    const isTimeoutError =
      error.name === "TimeoutError" ||
      error.constructor.name === "TimeoutError" ||
      error.name === "APIConnectionTimeoutError" ||
      error.constructor.name === "APIConnectionTimeoutError";

    const isRateLimitError =
      isCommonRateLimitError ||
      isAwsRateLimitError ||
      isGoogleRateLimitError ||
      isMistralRateLimitError ||
      isDeepSeekRateLimitError;

    const doRetry = isTimeoutError || isRateLimitError;
    logger.debug(
      "  -> Should wait and retry? {doRetry} (timeout: {isTimeoutError}, rate limit: {isRateLimitError})",
      {
        doRetry,
        isTimeoutError,
        isRateLimitError,
      },
    );

    return doRetry;
  }

  // TODO: This function is infested with bad types, figure out a better way
  // or simply replace LangChain with AI SDK or custom code.
  protected async invokeChain<
    RunInput = any,
    RunOutput = any,
    CallOptions extends RunnableConfig = RunnableConfig,
  >(
    chain: Runnable<RunInput, RunOutput, CallOptions>,
    input: RunInput,
    meta: LlmContext.Meta,
    options?: Partial<CallOptions>,
  ): Promise<BaseAgentResponse> {
    return retry(
      {
        maxAttempts: 1 + MODEL_RETRIES,
        backOff: 2000,
        doRetry: (error) => BaseAgent.shouldRetry(error),
      },
      async () => {
        const contextPrompts: string[] = [];

        const agentName = agentClassNameToPromptsAgentKind(
          this.constructor.name,
        );

        logger.debug(`Invoking ${agentName} agent chain input: {input}`, {
          input: optionalLogDebugExtra("langchain", input),
        });

        // @ts-expect-error
        const result = await chain.invoke(input, {
          ...options,
          timeout: MODEL_TIMEOUT_SEC * 1000,
          callbacks: [
            {
              handleChatModelStart: (_llm, baseMessages) => {
                contextPrompts.push(
                  ...baseMessages.map((baseMessage) =>
                    convertInputToPromptValue
                      .call(this, baseMessage)
                      .toString(),
                  ),
                );
                this.#llmContext.assignPromptsMeta(contextPrompts, meta);
              },
            },
          ],
        });

        logger.debug(`Got ${agentName} agent chain result: {result}`, {
          result: optionalLogDebugExtra("langchain", result),
        });

        this.#llmContext.clearPromptsMeta(contextPrompts);

        let message: any;
        let structured: unknown = null;
        if (typeof result === "object" && result && "raw" in result) {
          message = result.raw;
          structured = (result as any).parsed;
        } else {
          message = result;
        }

        const reasoning = this.#extractReasoning(message);
        if (reasoning) {
          logger.info(this.formatLog("out", "Reasoning"), {
            detail: optionalLogDebugExtra("reasoning", reasoning),
          });
        }

        if (message.usage_metadata) {
          this.#updateUsage(message.usage_metadata);
        }

        return new BaseAgentResponse({
          content: this.#extractText(message.content),
          reasoning,
          structured,
          toolCalls: message.tool_calls ?? [],
          usage: this.usage,
        });
      },
    );
  }

  #extractReasoning(message: AIMessage): string | null {
    return (
      this.#extractReasoningFromContent(message.content as object[]) ??
      this.#extractReasoningFromAdditional(message.additional_kwargs)
    );
  }

  #extractReasoningFromContent(content: object[]): string | null {
    if (!Array.isArray(content) || !content.length) {
      return null;
    }

    // Collect all reasoning from content blocks
    const reasoningParts: string[] = [];

    for (const block of content) {
      if (!block || typeof block !== "object") {
        continue;
      }

      if ("reasoning_content" in block) {
        // Anthropic
        reasoningParts.push(String(block["reasoning_content"]));
      } else if (
        "type" in block &&
        block["type"] === "reasoning" &&
        "reasoning" in block
      ) {
        // OpenAI
        reasoningParts.push(String(block["reasoning"]));
      } else if ("thinking" in block) {
        // Google
        reasoningParts.push(String(block["thinking"]));
      }
    }

    return reasoningParts.length > 0 ? reasoningParts.join(" ") : null;
  }

  #extractReasoningFromAdditional(additional: object): string | null {
    if (!additional || typeof additional !== "object") return null;
    const value = (additional as Record<string, unknown>)["reasoning_content"];
    return typeof value === "string" && value ? value : null;
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
    this.usage.input_tokens += usage.input_tokens ?? 0;
    this.usage.output_tokens += usage.output_tokens ?? 0;
    this.usage.total_tokens += usage.total_tokens ?? 0;
  }

  protected formatLog(dir: BaseAgent.LogDir, topic: string) {
    return `  ${dir === "in" ? "->" : "<-"} ${topic}: {detail}`;
  }

  protected logData(
    logger: LoggerLike,
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

  protected debugLogTreeDetail(
    treeXml: string,
  ): BaseAgentDebugLogDetail | string {
    return optionalLogDebugExtra("tree", new BaseAgentDebugLogDetail(treeXml));
  }

  protected debugLogDetail(value: unknown): BaseAgentDebugLogDetail {
    return new BaseAgentDebugLogDetail(value);
  }
}
