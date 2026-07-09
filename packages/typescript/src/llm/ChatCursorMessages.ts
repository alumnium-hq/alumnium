import type { ToolDefinition } from "@langchain/core/language_models/base";
import type { BaseMessage } from "@langchain/core/messages";
import z from "zod";

export interface CursorImage {
  data: string;
  mimeType: string;
}

export interface CursorPrompt {
  text: string;
  images: CursorImage[];
}

export interface CursorToolCall {
  name: string;
  args: Record<string, unknown>;
}

/**
 * Cursor agents run with their own harness (file, terminal, and MCP tools).
 * Alumnium uses them as a plain chat model, so every prompt forbids using any
 * of those tools.
 */
export const CHAT_GUARDRAILS = `
# Execution context
You are used as a chat completion model inside another application.
Do NOT read or write files, run terminal commands, search the web, or use any
built-in or MCP tools. Reply with a single final assistant message directly.
`.trim();

const ROLE_TAGS: Record<string, string> = {
  system: "system",
  human: "user",
  ai: "assistant",
  tool: "tool_result",
};

/**
 * Serialize a LangChain message array into a single role-tagged prompt string
 * plus any data-URL images extracted from `image_url` content blocks.
 */
export function serializeMessages(messages: BaseMessage[]): CursorPrompt {
  const images: CursorImage[] = [];

  const sections = messages.map((message) => {
    const tag = ROLE_TAGS[message.getType()] ?? "user";
    const text = serializeContent(message.content, images);
    return `<${tag}>\n${text}\n</${tag}>`;
  });

  return { text: sections.join("\n\n"), images };
}

function serializeContent(
  content: BaseMessage["content"],
  images: CursorImage[],
): string {
  if (typeof content === "string") return content;

  const parts = content.map((block) => {
    if (block.type === "text" && "text" in block) return String(block.text);

    if (block.type === "image_url" && "image_url" in block) {
      const imageUrl: unknown = block.image_url;
      const url =
        typeof imageUrl === "string"
          ? imageUrl
          : (imageUrl as { url?: unknown }).url;
      if (typeof url !== "string") return "";

      const image = parseDataUrl(url);
      if (image) {
        images.push(image);
        return `[image ${images.length} attached]`;
      }
      return url;
    }

    return "";
  });

  return parts.filter((part) => part).join("\n");
}

const DATA_URL_RE = /^data:([^;,]+);base64,(.+)$/s;

export function parseDataUrl(url: string): CursorImage | null {
  const match = url.match(DATA_URL_RE);
  if (!match?.[1] || !match[2]) return null;
  return { mimeType: match[1], data: match[2] };
}

/**
 * Build the prompt block instructing the model to answer with tool calls as
 * a single JSON object. Cursor has no native tool-calling API surface, so the
 * contract is enforced through the prompt and parsed from the response text.
 */
export function buildToolContract(tools: ToolDefinition[]): string {
  const schemas = tools.map((tool) => tool.function);
  return `
# Tool calling
Decide which of the following tools to call to fulfill the request above.
Available tools (JSON schema per tool):
\`\`\`json
${JSON.stringify(schemas, null, 2)}
\`\`\`
Respond with ONLY a JSON object of this exact shape and no other text:
{"tool_calls": [{"name": "<tool_name>", "arguments": {<parameters>}}]}
List multiple entries when several calls are needed, in execution order.
If no tool applies, respond with {"tool_calls": []}.
`.trim();
}

/**
 * Extract the first balanced JSON object from a text response, tolerating
 * markdown fences and surrounding prose. Returns null when none is found.
 */
export function extractJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start === -1) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;

  for (let i = start; i < text.length; i++) {
    const char = text[i];

    if (escaped) {
      escaped = false;
    } else if (inString) {
      if (char === "\\") escaped = true;
      else if (char === '"') inString = false;
    } else if (char === '"') {
      inString = true;
    } else if (char === "{") {
      depth++;
    } else if (char === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }

  return null;
}

const ToolCallsResponse = z.object({
  tool_calls: z.array(
    z.object({
      name: z.string(),
      arguments: z.record(z.string(), z.unknown()).optional(),
      args: z.record(z.string(), z.unknown()).optional(),
    }),
  ),
});

/**
 * Parse the model's tool-call JSON reply into normalized calls. Throws a
 * descriptive error when the reply does not follow the tool contract.
 */
export function parseToolCalls(text: string): CursorToolCall[] {
  const json = extractJsonObject(text);
  if (!json) {
    throw new Error("Response does not contain a JSON object with tool calls");
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(json);
  } catch (error) {
    throw new Error(
      `Response contains invalid JSON: ${error instanceof Error ? error.message : String(error)}`,
    );
  }

  const result = ToolCallsResponse.safeParse(parsed);
  if (!result.success) {
    throw new Error(
      `Response JSON does not match the tool call contract: ${result.error.message}`,
    );
  }

  return result.data.tool_calls.map((call) => ({
    name: call.name,
    args: call.arguments ?? call.args ?? {},
  }));
}
