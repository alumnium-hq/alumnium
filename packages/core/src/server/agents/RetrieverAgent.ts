import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { MessageContent } from "@langchain/core/messages";
import z from "zod";
import { pythonicFormat } from "../../pythonic/pythonicFormat.js";
import { getLogger } from "../../utils/logger.js";
import { BaseAgent } from "./BaseAgent.js";

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
}

export class RetrieverAgent extends BaseAgent {
  static readonly #LIST_SEPARATOR = "<SEP>";

  chain;

  constructor(llm: BaseChatModel) {
    super();

    this.chain = llm.withStructuredOutput(RetrievedInformation, {
      includeRaw: true,
    });
  }

  async invoke(
    information: string,
    accessibilityTreeXml: string,
    title = "",
    url = "",
    screenshot: string | null = null,
  ): Promise<RetrieverAgent.InvokeResult> {
    logger.info("Starting retrieval:");
    this.logData(logger, "in", {
      Information: information,
      "Accessibility tree": this.debugLogValue(accessibilityTreeXml),
      Title: this.debugLogValue(title),
      URL: this.debugLogValue(url),
    });

    let prompt = "";
    if (!screenshot) {
      prompt += pythonicFormat(this.prompts.user, {
        accessibility_tree: accessibilityTreeXml,
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

    const message = await this.invokeChain(this.chain, [
      [
        "system",
        pythonicFormat(this.prompts.system, {
          separator: RetrieverAgent.#LIST_SEPARATOR,
        }),
      ],
      ["human", humanMessages],
    ]);

    this.logData(logger, "out", {
      Result: message.parsed,
      Usage: BaseAgent.getMessageUsage(message.raw),
    });

    let value = message.parsed.value;
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

    // Return raw string or list of strings
    if (value.includes(RetrieverAgent.#LIST_SEPARATOR)) {
      return [
        message.parsed.explanation,
        value
          .split(RetrieverAgent.#LIST_SEPARATOR)
          .map((item) => item.trim())
          .filter((item) => item),
      ];
    } else {
      return [message.parsed.explanation, value];
    }
  }
}
