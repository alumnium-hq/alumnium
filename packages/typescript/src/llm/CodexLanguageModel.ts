import { createOpenAI } from "@ai-sdk/openai";
import type {
  LanguageModelV4,
  LanguageModelV4CallOptions,
  LanguageModelV4GenerateResult,
  LanguageModelV4StreamPart,
  LanguageModelV4StreamResult,
} from "@ai-sdk/provider";
import {
  startOpenAIOAuthServer,
  type OpenAIOAuthServerOptions,
  type RunningOpenAIOAuthServer,
} from "openai-oauth";
import { Env } from "../Env.ts";

const DUMMY_API_KEY = "codex-oauth";
const LITTERBOX_URL =
  "https://litterbox.catbox.moe/resources/internals/api.php";
const STRUCTURED_OUTPUT_TOOL = "__alumnium_structured_output";

type LitterboxTtl = "1h" | "12h" | "24h" | "72h";
type CodexFetch = (
  input: string | URL | Request,
  init?: RequestInit,
) => Promise<Response>;

export interface CodexLanguageModelOptions {
  modelId: string;
  oauthServerOptions?: Omit<OpenAIOAuthServerOptions, "models">;
  litterboxUpload?: boolean;
  litterboxTtl?: LitterboxTtl;
  fetch?: CodexFetch;
  startServer?: (
    options: OpenAIOAuthServerOptions,
  ) => Promise<RunningOpenAIOAuthServer>;
  createDelegate?: (baseURL: string, modelId: string) => LanguageModelV4;
}

export class CodexLanguageModel implements LanguageModelV4 {
  readonly specificationVersion = "v4";
  readonly provider = "codex";
  readonly modelId: string;
  readonly supportedUrls: Record<string, RegExp[]> = {};

  #server: RunningOpenAIOAuthServer | undefined;
  #serverPromise: Promise<RunningOpenAIOAuthServer> | undefined;
  #delegate: LanguageModelV4 | undefined;
  #options: CodexLanguageModelOptions;
  #uploader: LitterboxUploader;
  #litterboxUpload: boolean;

  constructor(options: CodexLanguageModelOptions) {
    this.modelId = options.modelId;
    this.#options = options;
    this.#litterboxUpload =
      options.litterboxUpload ?? Env.LANGCHAIN_CODEX_LITTERBOX_UPLOAD;
    this.#uploader = new LitterboxUploader(
      options.litterboxTtl ?? "1h",
      options.fetch ?? globalThis.fetch,
    );
  }

  async doGenerate(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4GenerateResult> {
    const structuredTool = structuredOutputToolName(options);
    const delegate = await this.#ensureDelegate();
    const result = await delegate.doGenerate(
      await this.#prepareOptions(options, structuredTool),
    );
    return structuredTool
      ? translateStructuredResult(result, structuredTool)
      : result;
  }

  async doStream(
    options: LanguageModelV4CallOptions,
  ): Promise<LanguageModelV4StreamResult> {
    const structuredTool = structuredOutputToolName(options);
    const delegate = await this.#ensureDelegate();
    const result = await delegate.doStream(
      await this.#prepareOptions(options, structuredTool),
    );
    if (!structuredTool) return result;

    return {
      ...result,
      stream: result.stream.pipeThrough(structuredOutputStream(structuredTool)),
    };
  }

  async close(): Promise<void> {
    if (!this.#serverPromise) return;

    const server = await this.#serverPromise;
    await server.close();
    this.#server = undefined;
    this.#serverPromise = undefined;
    this.#delegate = undefined;
  }

  async #prepareOptions(
    options: LanguageModelV4CallOptions,
    structuredTool: string | undefined,
  ): Promise<LanguageModelV4CallOptions> {
    const prompt = await replaceBase64Images(
      options.prompt,
      this.#litterboxUpload,
      this.#uploader,
    );
    if (!structuredTool || options.responseFormat?.type !== "json") {
      return { ...options, prompt };
    }

    return {
      ...options,
      prompt,
      responseFormat: { type: "text" },
      tools: [
        ...(options.tools ?? []),
        {
          type: "function",
          name: structuredTool,
          description:
            options.responseFormat.description ??
            "Return the response in the required structured format.",
          inputSchema: options.responseFormat.schema ?? { type: "object" },
          strict: true,
        },
      ],
      toolChoice: { type: "tool", toolName: structuredTool },
    };
  }

  async #ensureDelegate(): Promise<LanguageModelV4> {
    if (this.#delegate) return this.#delegate;

    const server = await this.#ensureServer();
    const createDelegate =
      this.#options.createDelegate ?? defaultCreateDelegate;
    this.#delegate = createDelegate(server.url, this.modelId);
    return this.#delegate;
  }

  #ensureServer(): Promise<RunningOpenAIOAuthServer> {
    if (this.#server) return Promise.resolve(this.#server);
    if (!this.#serverPromise) {
      const startServer = this.#options.startServer ?? startOpenAIOAuthServer;
      this.#serverPromise = startServer({
        host: "127.0.0.1",
        port: 0,
        ...this.#options.oauthServerOptions,
      }).then((server) => {
        this.#server = server;
        server.server.unref();
        return server;
      });
    }
    return this.#serverPromise;
  }
}

function defaultCreateDelegate(
  baseURL: string,
  modelId: string,
): LanguageModelV4 {
  return createOpenAI({ baseURL, apiKey: DUMMY_API_KEY, name: "codex" }).chat(
    modelId,
  );
}

function structuredOutputToolName(
  options: LanguageModelV4CallOptions,
): string | undefined {
  if (options.responseFormat?.type !== "json") return undefined;

  let name = STRUCTURED_OUTPUT_TOOL;
  const toolNames = new Set(
    options.tools?.map((tool) =>
      tool.type === "function" ? tool.name : tool.name,
    ),
  );
  while (toolNames.has(name)) name += "_";
  return name;
}

function translateStructuredResult(
  result: LanguageModelV4GenerateResult,
  toolName: string,
): LanguageModelV4GenerateResult {
  const content = result.content.flatMap((part) =>
    part.type === "tool-call" && part.toolName === toolName
      ? [{ type: "text" as const, text: part.input }]
      : [part],
  );
  const hasText = content.some(
    (part) => part.type === "text" && part.text.trim(),
  );

  return {
    ...result,
    content,
    finishReason:
      result.finishReason.unified === "tool-calls" ||
      (result.finishReason.unified === "other" && hasText)
        ? { unified: "stop", raw: result.finishReason.raw }
        : result.finishReason,
  };
}

function structuredOutputStream(
  toolName: string,
): TransformStream<LanguageModelV4StreamPart, LanguageModelV4StreamPart> {
  let isStructuredTool = false;
  return new TransformStream({
    transform(part, controller) {
      if (part.type === "tool-input-start" && part.toolName === toolName) {
        isStructuredTool = true;
        controller.enqueue({ type: "text-start", id: part.id });
      } else if (part.type === "tool-input-delta" && isStructuredTool) {
        controller.enqueue({
          type: "text-delta",
          id: part.id,
          delta: part.delta,
        });
      } else if (part.type === "tool-input-end" && isStructuredTool) {
        controller.enqueue({ type: "text-end", id: part.id });
        isStructuredTool = false;
      } else if (part.type === "tool-call" && part.toolName === toolName) {
        // The streamed input deltas already became text deltas.
      } else if (
        part.type === "finish" &&
        part.finishReason.unified === "tool-calls"
      ) {
        controller.enqueue({
          ...part,
          finishReason: { unified: "stop", raw: part.finishReason.raw },
        });
      } else {
        controller.enqueue(part);
      }
    },
  });
}

async function replaceBase64Images(
  prompt: LanguageModelV4CallOptions["prompt"],
  enabled: boolean,
  uploader: LitterboxUploader,
): Promise<LanguageModelV4CallOptions["prompt"]> {
  return Promise.all(
    prompt.map(async (message) => {
      if (message.role === "user") {
        const content = await Promise.all(
          message.content.map((part) =>
            replaceBase64Image(part, enabled, uploader),
          ),
        );
        return { ...message, content };
      }
      if (message.role === "assistant") {
        const content = await Promise.all(
          message.content.map((part) =>
            replaceBase64Image(part, enabled, uploader),
          ),
        );
        return { ...message, content };
      }
      return message;
    }),
  );
}

async function replaceBase64Image<Part>(
  part: Part,
  enabled: boolean,
  uploader: LitterboxUploader,
): Promise<Part> {
  if (
    !part ||
    typeof part !== "object" ||
    !("type" in part) ||
    part.type !== "file" ||
    !("mediaType" in part) ||
    typeof part.mediaType !== "string" ||
    !part.mediaType.startsWith("image/") ||
    !("data" in part) ||
    !part.data ||
    typeof part.data !== "object" ||
    !("type" in part.data) ||
    part.data.type !== "data" ||
    !("data" in part.data) ||
    (typeof part.data.data !== "string" &&
      !(part.data.data instanceof Uint8Array))
  ) {
    return part;
  }
  if (!enabled) {
    throw new Error(
      "Codex models do not support inline images. Enable litterboxUpload or set LANGCHAIN_CODEX_LITTERBOX_UPLOAD=true to upload images to Litterbox.",
    );
  }

  const base64 = imageBase64(part.data.data);
  const url = await uploader.upload(base64, part.mediaType);
  return { ...part, data: { type: "url", url } };
}

function imageBase64(data: string | Uint8Array): string {
  if (typeof data !== "string") return Buffer.from(data).toString("base64");
  const match = data.match(/^data:image\/[^;]+;base64,(.+)$/s);
  return match?.[1] ?? data;
}

class LitterboxUploader {
  #cache = new Map<string, string>();
  #ttl: LitterboxTtl;
  #fetch: CodexFetch;

  constructor(ttl: LitterboxTtl, fetch: CodexFetch) {
    this.#ttl = ttl;
    this.#fetch = fetch;
  }

  async upload(base64: string, mediaType: string): Promise<string> {
    const hash = fnv1aHash(base64);
    const cached = this.#cache.get(hash);
    if (cached) return cached;

    const extension = mediaType.split("/")[1] ?? "png";
    const form = new FormData();
    form.set("reqtype", "fileupload");
    form.set("time", this.#ttl);
    form.set(
      "fileToUpload",
      new File([Buffer.from(base64, "base64")], `image.${extension}`, {
        type: mediaType,
      }),
    );
    const response = await this.#fetch(LITTERBOX_URL, {
      method: "POST",
      body: form,
    });
    const url = (await response.text()).trim();
    if (!url.startsWith("https://")) {
      throw new Error(`Litterbox upload failed: ${url}`);
    }

    this.#cache.set(hash, url);
    return url;
  }
}

function fnv1aHash(value: string): string {
  let hash = 0xcbf29ce484222325n;
  for (let index = 0; index < value.length; index++) {
    hash ^= BigInt(value.charCodeAt(index));
    hash = (hash * 0x100000001b3n) & 0xffffffffffffffffn;
  }
  return hash.toString(16);
}
