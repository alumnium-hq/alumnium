import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { MessageContent } from "@langchain/core/messages";
import z from "zod";
import { pythonicFormat } from "../../pythonic/pythonicFormat.ts";
import { getLogger } from "../../utils/logger.ts";
import type { LlmContext } from "../LlmContext.ts";
import { BaseAgent } from "./BaseAgent.ts";

const logger = getLogger(import.meta.url);

/**
 * Retrieved information.
 */
export const RetrievedInformation = z.object({
  explanation: z
    .string()
    .describe(
      "Explanation how information was retrieved and why it's related to the requested information." +
        "Always include the requested information and its value in the explanation.",
    ),
  value: z
    .string()
    .describe(
      "The precise retrieved information value without additional data. If the information is not" +
        "present in context, reply NOOP.",
    ),
});

export type RetrievedInformation = z.infer<typeof RetrievedInformation>;

export namespace RetrieverAgent {
  export type InvokeResult = [string, string | string[]];

  export type Meta = z.infer<typeof RetrieverAgent.Meta>;
}

export class RetrieverAgent extends BaseAgent {
  static Meta = z.object({
    kind: z.literal("retriever"),
    information: z.string(),
    treeXml: z.string(),
    title: z.string(),
    url: z.string(),
    screenshot: z.string().nullable(),
  });

  static readonly EXCLUDE_ATTRIBUTES = new Set(["id"]);
  static readonly #LIST_SEPARATOR = "<SEP>";

  chain;

  constructor(llmContext: LlmContext, llm: BaseChatModel) {
    super(llmContext);

    this.chain = llm.withStructuredOutput(RetrievedInformation, {
      includeRaw: true,
    });
  }

  async invoke(
    information: string,
    treeXml: string,
    title = "",
    url = "",
    screenshot: string | null = null,
  ): Promise<RetrieverAgent.InvokeResult> {
    logger.info("Starting retrieval:");
    this.logData(logger, "in", {
      Information: information,
      "Accessibility tree": this.debugLogDetail(treeXml),
      Title: this.debugLogDetail(title),
      URL: this.debugLogDetail(url),
    });

    let prompt = "";
    if (!screenshot) {
      prompt += pythonicFormat(this.prompts.user, {
        accessibility_tree: treeXml,
        title,
        url,
      });
    }
    prompt += "\n";
    prompt += `Retrieve the following information: ${information}`;

    const humanMessages: MessageContent = [{ type: "text", text: prompt }];

    if (screenshot) {
      humanMessages.push({
        type: "image_url",
        image_url: {
          url: `data:image/png;base64,${screenshot}`,
        },
      });
    }

    const meta: RetrieverAgent.Meta = {
      kind: "retriever",
      information,
      treeXml,
      title,
      url,
      screenshot,
    };

    const response = await this.invokeChain(
      this.chain,
      [
        [
          "system",
          pythonicFormat(this.prompts.system, {
            separator: RetrieverAgent.#LIST_SEPARATOR,
          }),
        ],
        ["human", humanMessages],
      ],
      meta,
    );

    this.logData(logger, "out", {
      Result: response.structured,
      Usage: response.usage,
    });

    let value = (response.structured as RetrievedInformation).value;
    // LLMs sometimes add separator to the start/end.
    if (value.startsWith(RetrieverAgent.#LIST_SEPARATOR)) {
      value = value.slice(RetrieverAgent.#LIST_SEPARATOR.length);
    }
    if (value.endsWith(RetrieverAgent.#LIST_SEPARATOR)) {
      value = value.slice(0, -RetrieverAgent.#LIST_SEPARATOR.length);
    }
    value = value.trim();
    // GPT-5 Nano sometimes replaces closing brace with something else
    value = value.replace(
      new RegExp(`${RetrieverAgent.#LIST_SEPARATOR.slice(0, -1)}.`, "g"),
      RetrieverAgent.#LIST_SEPARATOR,
    );
    // Grok 4.1 Fast Reasoning sometimes use escaped tags
    value = value.replace("&lt;SEP&gt;", RetrieverAgent.#LIST_SEPARATOR);

    // Return raw string or list of strings
    if (value.includes(RetrieverAgent.#LIST_SEPARATOR)) {
      return [
        (response.structured as RetrievedInformation).explanation,
        value
          .split(RetrieverAgent.#LIST_SEPARATOR)
          .filter((item) => item)
          .map((item) => item.trim()),
      ];
    } else {
      return [(response.structured as RetrievedInformation).explanation, value];
    }
  }
}
