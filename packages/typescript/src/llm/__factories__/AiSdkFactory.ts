import type {
  LanguageModelV4GenerateResult,
  LanguageModelV4ToolCall,
  LanguageModelV4Usage,
} from "@ai-sdk/provider";

export namespace AiSdkFactory {
  export interface ResultProps {
    text?: string;
    toolCalls?: LanguageModelV4ToolCall[];
    usage?: {
      inputTokens?: Partial<LanguageModelV4Usage["inputTokens"]>;
      outputTokens?: Partial<LanguageModelV4Usage["outputTokens"]>;
      raw?: LanguageModelV4Usage["raw"];
    };
  }
}

export abstract class AiSdkFactory {
  static toolCall(
    overrides: {
      id?: string;
      name?: string;
      args?: Record<string, unknown>;
      input?: string;
    } = {},
  ): LanguageModelV4ToolCall {
    return {
      type: "tool-call",
      toolCallId: overrides.id ?? "call-id",
      toolName: overrides.name ?? "ClickTool",
      input: overrides.input ?? JSON.stringify(overrides.args ?? { id: 42 }),
    };
  }

  static generateResult(
    props: AiSdkFactory.ResultProps = {},
  ): LanguageModelV4GenerateResult {
    const inputTokens = props.usage?.inputTokens;
    const outputTokens = props.usage?.outputTokens;
    return {
      content: [
        ...(props.text === undefined
          ? []
          : [{ type: "text" as const, text: props.text }]),
        ...(props.toolCalls ?? []),
      ],
      finishReason: { unified: "stop", raw: undefined },
      usage: {
        inputTokens: {
          total: inputTokens?.total ?? 1,
          noCache: inputTokens?.noCache,
          cacheRead: inputTokens?.cacheRead,
          cacheWrite: inputTokens?.cacheWrite,
        },
        outputTokens: {
          total: outputTokens?.total ?? 2,
          text: outputTokens?.text,
          reasoning: outputTokens?.reasoning,
        },
        ...(props.usage?.raw === undefined ? {} : { raw: props.usage.raw }),
      },
      warnings: [],
    };
  }
}
