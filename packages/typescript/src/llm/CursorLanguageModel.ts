import {
  APICallError,
  UnsupportedFunctionalityError,
  type LanguageModelV4,
  type LanguageModelV4CallOptions,
  type LanguageModelV4GenerateResult,
  type LanguageModelV4StreamPart,
  type LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import type {
  RunResult,
  SDKAgent,
  SDKImage,
  SDKUserMessage,
  TokenUsage,
} from "@cursor/sdk";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { z } from "zod";
import { Logger } from "../telemetry/Logger.ts";

export type CursorSdkModule = typeof import("@cursor/sdk");

export interface CursorLanguageModelOptions {
  modelId: string;
  apiKey?: string;
  sdkLoader?: () => Promise<CursorSdkModule>;
}

const logger = Logger.get(import.meta.url);
const CHAT_CONTEXT = `# Execution context
You are used as a chat completion model inside another application.
Do NOT read or write files, run terminal commands, search the web, or use any
built-in or MCP tools. Reply with a single final assistant message directly.`;
const ToolCallsResponse = z.object({
  tool_calls: z.array(
    z.object({
      name: z.string(),
      arguments: z.record(z.string(), z.unknown()).optional(),
      args: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

/** Cursor has no chat API; emulate completions with a fresh local agent. */
export class CursorLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = "v4";
  readonly provider = "cursor";
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};
  #options: CursorLanguageModelOptions;
  #sandbox = true;

  constructor(options: CursorLanguageModelOptions) {
    this.modelId = options.modelId;
    this.#options = options;
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const abort = createAbortScope(options.abortSignal);
    try {
      return await this.#generateOnce(options, abort);
    } catch (error) {
      options.abortSignal?.throwIfAborted();
      if (
        this.#sandbox &&
        error instanceof Error &&
        error.name === "ConfigurationError" &&
        /sandbox/i.test(error.message)
      ) {
        logger.warn(
          "Cursor SDK sandboxing is not supported; retrying without it.",
        );
        this.#sandbox = false;
        return await this.doGenerate(options);
      }
      if (
        error instanceof Error &&
        (error.name === "RateLimitError" ||
          error.name === "TimeoutError" ||
          ("isRetryable" in error && error.isRetryable === true))
      ) {
        throw new APICallError({
          message: error.message,
          url: "cursor://local",
          requestBodyValues: { model: this.modelId },
          isRetryable: true,
          cause: error,
        });
      }
      throw error;
    } finally {
      abort.dispose();
    }
  }

  // The local runtime returns a complete reply; expose it as a buffered stream.
  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const result = await this.doGenerate(options);
    return {
      stream: new ReadableStream<LanguageModelV4StreamPart>({
        start(controller) {
          controller.enqueue({
            type: "stream-start",
            warnings: result.warnings,
          });
          controller.enqueue({ type: "response-metadata", ...result.response });
          for (const part of result.content) {
            if (part.type === "text") {
              const id = crypto.randomUUID();
              controller.enqueue({ type: "text-start", id });
              controller.enqueue({ type: "text-delta", id, delta: part.text });
              controller.enqueue({ type: "text-end", id });
            } else if (part.type === "tool-call") {
              controller.enqueue(part);
            }
          }
          controller.enqueue({
            type: "finish",
            usage: result.usage,
            finishReason: result.finishReason,
          });
          controller.close();
        },
      }),
    };
  }

  async #generateOnce(
    options: LanguageModelV4CallOptions,
    abort: ReturnType<typeof createAbortScope>,
  ): Promise<LanguageModelV4GenerateResult> {
    const signal = options.abortSignal;
    signal?.throwIfAborted();
    const prompt = serializePrompt(options);
    const contract = responseContract(options);
    const sdk = await abort.run((this.#options.sdkLoader ?? loadCursorSdk)());
    const root = await fs.mkdtemp(path.join(os.tmpdir(), "alumnium-cursor-"));
    let agent: SDKAgent | undefined;
    try {
      const cwd = path.join(root, "workspace");
      await fs.mkdir(cwd);
      const store = new sdk.JsonlLocalAgentStore(path.join(root, "store"));
      signal?.throwIfAborted();
      agent = await abort.run(
        sdk.Agent.create({
          ...(this.#options.apiKey ? { apiKey: this.#options.apiKey } : {}),
          model: { id: this.modelId },
          local: {
            cwd,
            settingSources: [],
            sandboxOptions: { enabled: this.#sandbox },
            store,
          },
        }),
        async (lateAgent) => {
          try {
            lateAgent.close();
          } finally {
            await fs.rm(root, { recursive: true, force: true });
          }
        },
      );
      const first = await send(
        agent,
        {
          text: [prompt.text, CHAT_CONTEXT, contract]
            .filter(Boolean)
            .join("\n\n"),
          images: prompt.images,
        },
        abort,
      );
      const usages = [first.usage];
      let content: LanguageModelV4GenerateResult["content"];
      try {
        content = parseResponse(first.result ?? "", options);
      } catch (error) {
        const retry = await send(
          agent,
          {
            text: `Your previous reply was invalid: ${error instanceof Error ? error.message : String(error)}\nRespond again following this contract exactly:\n${contract}`,
          },
          abort,
        );
        usages.push(retry.usage);
        content = parseResponse(retry.result ?? "", options);
      }
      return {
        content,
        finishReason: {
          unified: content.some((part) => part.type === "tool-call")
            ? "tool-calls"
            : "stop",
          raw: "finished",
        },
        usage: toUsage(usages),
        warnings: [],
        response: { id: first.id, modelId: this.modelId },
      };
    } finally {
      try {
        agent?.close();
      } finally {
        await fs.rm(root, { recursive: true, force: true });
      }
    }
  }
}

async function loadCursorSdk(): Promise<CursorSdkModule> {
  return import("@cursor/sdk");
}

function serializePrompt(options: LanguageModelV4CallOptions): {
  text: string;
  images: SDKImage[];
} {
  const images: SDKImage[] = [];
  const sections = options.prompt.map((message) => {
    const text =
      message.role === "system"
        ? message.content
        : message.content
            .map((part) => {
              if (part.type === "text" || part.type === "reasoning")
                return part.text;
              if (part.type === "tool-call")
                return JSON.stringify({
                  tool_call_id: part.toolCallId,
                  name: part.toolName,
                  arguments: part.input,
                });
              if (part.type === "tool-result")
                return JSON.stringify({
                  tool_call_id: part.toolCallId,
                  name: part.toolName,
                  output: part.output,
                });
              if (part.type === "file" && part.mediaType.startsWith("image/")) {
                if (part.data.type === "url") return part.data.url.toString();
                if (part.data.type === "data") {
                  images.push({
                    mimeType: part.mediaType,
                    data:
                      typeof part.data.data === "string"
                        ? part.data.data
                        : Buffer.from(part.data.data).toString("base64"),
                  });
                  return `[image ${images.length} attached]`;
                }
              }
              throw new UnsupportedFunctionalityError({
                functionality: `Cursor prompt part: ${part.type}`,
              });
            })
            .join("\n");
    const role = message.role === "tool" ? "tool_result" : message.role;
    return `<${role}>\n${text}\n</${role}>`;
  });
  return { text: sections.join("\n\n"), images };
}

function responseContract(options: LanguageModelV4CallOptions): string {
  if (options.responseFormat?.type === "json") {
    return `# Structured output\nRespond with ONLY valid JSON, with no other text.\n${options.responseFormat.description ?? ""}\nJSON schema: ${JSON.stringify(options.responseFormat.schema ?? {})}`;
  }
  const tools = activeTools(options);
  if (!tools.length) return "";
  return `# Tool calling
Decide which of these tools to call to fulfill the request. Do not execute them yourself.
Available tools (JSON schema per tool):
${JSON.stringify(tools)}
Respond with ONLY a JSON object of this exact shape and no other text:
{"tool_calls": [{"name": "<tool_name>", "arguments": {<parameters>}}]}
List multiple entries when several calls are needed, in execution order.
${options.toolChoice?.type === "required" || options.toolChoice?.type === "tool" ? "You MUST call at least one of the listed tools." : 'If no tool applies, respond with {"tool_calls": []}.'}`;
}

function activeTools(options: LanguageModelV4CallOptions) {
  if (options.toolChoice?.type === "none") return [];
  return (options.tools ?? [])
    .map((tool) => {
      if (tool.type !== "function")
        throw new UnsupportedFunctionalityError({
          functionality: "Cursor provider-defined tools",
        });
      return tool;
    })
    .filter(
      (tool) =>
        options.toolChoice?.type !== "tool" ||
        tool.name === options.toolChoice.toolName,
    );
}

function parseResponse(
  text: string,
  options: LanguageModelV4CallOptions,
): LanguageModelV4GenerateResult["content"] {
  if (options.responseFormat?.type === "json")
    return [{ type: "text", text: JSON.stringify(parseJson(text)) }];
  const tools = activeTools(options);
  if (!tools.length) return [{ type: "text", text }];
  const calls = ToolCallsResponse.parse(parseJson(text)).tool_calls;
  if (
    !calls.length &&
    (options.toolChoice?.type === "required" ||
      options.toolChoice?.type === "tool")
  )
    throw new Error("At least one tool call is required");
  return calls.map((call) => {
    if (!tools.some((tool) => tool.name === call.name))
      throw new Error(`Unknown or disallowed tool: ${call.name}`);
    return {
      type: "tool-call",
      toolCallId: `call_${crypto.randomUUID()}`,
      toolName: call.name,
      input: JSON.stringify(call.arguments ?? call.args ?? {}),
    };
  });
}

function parseJson(text: string): unknown {
  // Accept fenced replies and prose around JSON, including braces in strings.
  try {
    return JSON.parse(text);
  } catch {}
  const start = text.search(/[[{]/);
  let depth = 0;
  let quoted = false;
  let escaped = false;
  for (let index = start; index >= 0 && index < text.length; index++) {
    const char = text[index];
    if (escaped) escaped = false;
    else if (quoted && char === "\\") escaped = true;
    else if (char === '"') quoted = !quoted;
    else if (!quoted) {
      if (char === "{" || char === "[") depth++;
      else if ((char === "}" || char === "]") && --depth === 0)
        return JSON.parse(text.slice(start, index + 1));
    }
  }
  throw new Error("Response does not contain valid JSON");
}

async function send(
  agent: SDKAgent,
  payload: SDKUserMessage,
  abort: ReturnType<typeof createAbortScope>,
): Promise<RunResult> {
  abort.signal?.throwIfAborted();
  const run = await abort.run(agent.send(payload), (lateRun) => {
    void lateRun.cancel().catch(() => {});
  });
  let result: RunResult;
  try {
    result = await abort.run(run.wait());
  } catch (error) {
    void run.cancel().catch(() => {});
    throw error;
  }
  if (result.status !== "finished")
    throw new Error(
      `Cursor agent run ${result.status}: ${result.error?.message ?? "no error details"}`,
    );
  return result;
}

function createAbortScope(signal?: AbortSignal) {
  signal?.throwIfAborted();
  // Keep the listener for the entire call. In Bun 1.3.13, removing the last
  // listener between SDK operations disables an AbortSignal.timeout timer.
  let onAbort = () => {};
  const aborted = new Promise<never>((_, reject) => {
    onAbort = () => reject(signal?.reason);
    signal?.addEventListener("abort", onAbort, { once: true });
  });
  return {
    signal,
    async run<T>(
      promise: Promise<T>,
      onLateResult?: (value: T) => void | Promise<void>,
    ): Promise<T> {
      if (!signal) return promise;
      return Promise.race([
        promise.then(async (value) => {
          if (signal.aborted) {
            await onLateResult?.(value);
            signal.throwIfAborted();
          }
          return value;
        }),
        aborted,
      ]);
    },
    dispose() {
      signal?.removeEventListener("abort", onAbort);
    },
  };
}

function toUsage(
  usages: Array<TokenUsage | undefined>,
): LanguageModelV4GenerateResult["usage"] {
  const reported = usages.filter((usage) => usage !== undefined);
  function sum(key: keyof TokenUsage) {
    return reported.some((usage) => usage[key] !== undefined)
      ? reported.reduce((total, usage) => total + (usage[key] ?? 0), 0)
      : undefined;
  }
  const noCache = sum("inputTokens");
  const cacheRead = sum("cacheReadTokens");
  const cacheWrite = sum("cacheWriteTokens");
  return {
    inputTokens: {
      total:
        noCache === undefined
          ? undefined
          : noCache + (cacheRead ?? 0) + (cacheWrite ?? 0),
      noCache,
      cacheRead,
      cacheWrite,
    },
    outputTokens: {
      total: sum("outputTokens"),
      text: undefined,
      reasoning: sum("reasoningTokens"),
    },
  };
}
