import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { MessageContent } from "@langchain/core/messages";
import z from "zod";
import { pythonicFormat } from "../../pythonic/pythonicFormat.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import type { LlmContext } from "../LlmContext.ts";
import { BaseAgent } from "./BaseAgent.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

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
  export type Output = z.infer<typeof RetrieverAgent.Output>;

  export type Meta = z.infer<typeof RetrieverAgent.Meta>;

  export interface Props {
    statement: string;
    treeXml: string;
    title: string | undefined;
    url: string | undefined;
    screenshot: string | undefined | null;
  }
}

export class RetrieverAgent extends BaseAgent {
  static Meta = z.object({
    kind: z.literal("retriever"),
    statement: z.string(),
    treeXml: z.string(),
    title: z.string(),
    url: z.string(),
    screenshot: z.string().nullable(),
  });

  static Output = z.tuple([
    z.string(),
    z.union([z.string(), z.array(z.string())]),
  ]);

  static readonly EXCLUDE_ATTRIBUTES = new Set(["id"]);

  chain;

  constructor(llmContext: LlmContext, llm: BaseChatModel) {
    super(llmContext);

    this.chain = llm.withStructuredOutput(RetrievedInformation, {
      includeRaw: true,
    });
  }

  @span("agent.invoke", (props) => ({
    "agent.kind": "retriever",
    "agent.invoke.args.has_screenshot": !!props.screenshot,
  }))
  async invoke(props: RetrieverAgent.Props): Promise<RetrieverAgent.Output> {
    const {
      statement,
      treeXml,
      title = "",
      url = "",
      screenshot = null,
    } = props;

    logger.info("Starting retrieval:");
    this.logData(logger, "in", {
      Statement: statement,
      "Accessibility tree": this.debugLogTreeDetail(treeXml),
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
    prompt += `Retrieve the following information: ${statement}`;

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
      statement,
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
            separator: RetrieverAgent.#separatorSeq,
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

    const info = response.structured as RetrievedInformation;

    return [info.explanation, this.#parseValue(info.value)];
  }

  static readonly #separatorSeq = "<SEP>";
  static readonly #separatorSeqRe = new RegExp(
    RegExp.escape(this.#separatorSeq),
    "ig",
  );
  static readonly #separatorSeqVariantsRe = new RegExp(
    [
      // GPT-5 Nano sometimes replaces closing brace with something else
      `${RegExp.escape(this.#separatorSeq.slice(0, -1))}.`,
      // Grok 4.1 Fast Reasoning sometimes use escaped tags
      RegExp.escape(`&lt;${this.#separatorSeq.slice(1, -1)}&gt;`),
    ].join("|"),
    "ig",
  );

  #parseValue(value: string): string | string[] {
    const normalizedValue = value
      // Normalize separator variants
      .replace(
        RetrieverAgent.#separatorSeqVariantsRe,
        RetrieverAgent.#separatorSeq,
      );

    // Return as array of values if contains separator
    const values = normalizedValue.split(RetrieverAgent.#separatorSeqRe);
    if (values.length > 1)
      return values.map((item) => item.trim()).filter((item) => item);

    return normalizedValue.trim();
  }
}
