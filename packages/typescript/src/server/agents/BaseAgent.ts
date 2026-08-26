import { always } from "alwaysly";
import { APICallError } from "@ai-sdk/provider";
import {
  generateText,
  type LanguageModelUsage,
  type ModelMessage,
  Output,
  type ToolSet,
} from "ai";
import z from "zod";
import { Env } from "../../Env.ts";
import type { Model } from "../../Model.ts";
import type { LanguageModel } from "../../llm/LanguageModel.ts";
import { createLlmUsage, LlmUsage } from "../../llm/llmSchema.ts";
import { Logger } from "../../telemetry/Logger.ts";
import type { LoggerSchema } from "../../telemetry/LoggerSchema.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import { retry } from "../../utils/retry.ts";
import type { Agent } from "./Agent.ts";
import { agentPrompts } from "./prompts/bundledPrompts.ts";
import {
  agentClassNameToPromptsAgentKind,
  PROVIDER_TO_PROMPTS_DEV,
  type AgentPrompts,
} from "./prompts/prompts.ts";

const { logger, tracer } = Telemetry.get(import.meta.url);

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

/** Normalized response shared by all Alumnium agents. */
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

  export interface InvokeModelOptions {
    instructions: string;
    messages: ModelMessage[];
    meta: Agent.Meta;
    tools?: ToolSet;
    output?: ReturnType<typeof Output.object>;
    abortSignal?: AbortSignal;
  }
}

export class BaseAgent {
  static Goal = z.string().brand("BaseAgent.Goal");

  static Step = z.string().brand("BaseAgent.Step");

  protected llm: LanguageModel;
  protected model: Model;
  usage: LlmUsage = createLlmUsage();
  protected prompts: AgentPrompts.RolePrompts;

  constructor(model: Model, llm: LanguageModel) {
    this.model = model;
    this.llm = llm;

    const dev = PROVIDER_TO_PROMPTS_DEV[model.provider];
    const agentPromptsByDev =
      agentPrompts[agentClassNameToPromptsAgentKind(this.constructor.name)];
    const prompts = agentPromptsByDev[dev] ?? agentPromptsByDev.openai;
    always(prompts);
    this.prompts = prompts;
  }

  protected static shouldRetry(error: unknown): boolean {
    if (!(error instanceof Error)) return false;

    if (APICallError.isInstance(error)) {
      return (
        error.statusCode === 408 ||
        error.statusCode === 429 ||
        this.shouldRetry(error.cause)
      );
    }

    if (
      error.name === "TimeoutError" ||
      error.name === "APIConnectionTimeoutError" ||
      error.name === "RateLimitError" ||
      error.name === "InternalServerError"
    ) {
      return true;
    }

    if ("code" in error && error.code === 429) return true;
    if (!("response" in error) || !error.response) return false;
    if (typeof error.response !== "object") return false;
    if ("status_code" in error.response && error.response.status_code === 429) {
      return true;
    }
    if (!("Error" in error.response)) return false;
    const responseError = error.response.Error;
    return (
      typeof responseError === "object" &&
      responseError !== null &&
      "Code" in responseError &&
      responseError.Code === "ThrottlingException"
    );
  }

  protected async invokeModel(
    options: BaseAgent.InvokeModelOptions,
  ): Promise<BaseAgentResponse> {
    const agentKind = agentClassNameToPromptsAgentKind(this.constructor.name);

    logger.debug(`Sending ${agentKind} agent request: {messages}`, {
      messages: Logger.debugExtra("ai-sdk", options.messages),
    });
    logger.debug(`  -> Request args: {args}`, {
      args: Logger.debugExtra("ai-sdk", {
        instructions: options.instructions,
        tools: options.tools,
        output: options.output?.name,
      }),
    });

    const result = await retry(
      {
        maxAttempts: 1 + Env.ALUMNIUM_MODEL_RETRIES,
        backOff: 2000,
        doRetry: (error) =>
          !options.abortSignal?.aborted && BaseAgent.shouldRetry(error),
      },
      () =>
        tracer.span(
          "llm.request",
          {
            "llm.model.provider": this.model.provider,
            "llm.model.name": this.model.name,
          },
          () =>
            generateText({
              model: this.llm,
              instructions: options.instructions,
              messages: options.messages,
              maxRetries: 0,
              timeout: { totalMs: Env.ALUMNIUM_MODEL_TIMEOUT * 1000 },
              ...(options.abortSignal
                ? { abortSignal: options.abortSignal }
                : {}),
              providerOptions: {
                alumnium: {
                  meta: options.meta,
                },
              },
              ...(options.tools ? { tools: options.tools } : {}),
              ...(options.output ? { output: options.output } : {}),
            }),
        ),
    );

    logger.debug(`Got ${agentKind} agent result: {result}`, {
      result: Logger.debugExtra("ai-sdk", result),
    });

    const reasoning = result.reasoningText ?? null;
    if (reasoning) {
      logger.info(this.formatLog("out", "Reasoning"), {
        detail: Logger.debugExtra("reasoning", reasoning),
      });
    }

    this.#applyUsage(result.usage);

    return new BaseAgentResponse({
      content: result.text,
      reasoning,
      structured: options.output ? result.output : undefined,
      toolCalls: result.toolCalls.map((toolCall) => ({
        name: toolCall.toolName,
        args: toolCall.input,
      })),
      usage: this.usage,
    });
  }

  #applyUsage(usage: LanguageModelUsage): void {
    const inputTokens = usage.inputTokens ?? 0;
    const outputTokens = usage.outputTokens ?? 0;
    this.usage.input_tokens += inputTokens;
    this.usage.output_tokens += outputTokens;
    this.usage.total_tokens += usage.totalTokens ?? inputTokens + outputTokens;
    this.usage.cache_read += usage.inputTokenDetails.cacheReadTokens ?? 0;
    this.usage.cache_creation += usage.inputTokenDetails.cacheWriteTokens ?? 0;
    this.usage.reasoning += usage.outputTokenDetails.reasoningTokens ?? 0;
  }

  protected formatLog(dir: BaseAgent.LogDir, topic: string) {
    return `  ${dir === "in" ? "->" : "<-"} ${topic}: {detail}`;
  }

  protected logData(
    logger: LoggerSchema.Like,
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
    return Logger.debugExtra("tree", new BaseAgentDebugLogDetail(treeXml));
  }

  protected debugLogDetail(value: unknown): BaseAgentDebugLogDetail {
    return new BaseAgentDebugLogDetail(value);
  }
}
