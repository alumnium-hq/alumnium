import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  AIMessageChunk,
  BaseMessage,
  type MessageStructure,
} from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  FewShotChatMessagePromptTemplate,
} from "@langchain/core/prompts";
import { Runnable } from "@langchain/core/runnables";
import z from "zod";
import { Model } from "../../Model.ts";
import { pythonicFormat } from "../../pythonic/pythonicFormat.ts";
import { NavigateToUrlTool } from "../../tools/NavigateToUrlTool.ts";
import { UploadTool } from "../../tools/UploadTool.ts";
import { getLogger } from "../../utils/logger.ts";
import type { LlmContext } from "../LlmContext.ts";
import { BaseAgent } from "./BaseAgent.ts";

const logger = getLogger(import.meta.url);

export namespace PlannerAgent {
  export type Meta = z.infer<typeof PlannerAgent.Meta>;

  export interface ChainInput {
    goal: string;
    accessibility_tree: string;
  }

  export type ChainOutput = ChainOutputStructured | ChainOutputUnstructured;

  export interface ChainOutputStructured {
    raw: BaseMessage;
    parsed: Plan;
  }

  export type ChainOutputUnstructured = AIMessageChunk<MessageStructure>;

  export type Example = z.infer<typeof PlannerAgent.Example>;

  export type Plan = z.infer<typeof PlannerAgent.Plan>;
}

export class PlannerAgent extends BaseAgent {
  static Example = z.object({
    goal: z.string().describe("The goal to achieve."),
    accessibility_tree: z
      .string()
      .describe("The accessibility tree XML used for planning."),
    actions: z
      .array(z.string())
      .or(z.string())
      .describe(
        "The list of actions to achieve the goal. Can be a single string with actions separated by a special separator.",
      ),
  });

  static Plan = z.object({
    explanation: z
      .string()
      .describe(
        "Explanation how the actions were determined and why they are related to the goal. " +
          "Always include the goal, actions to achieve it, and their order in the explanation.",
      ),
    actions: z
      .array(z.string())
      .describe("List of actions to achieve the goal."),
  });

  static Meta = z.object({
    kind: z.literal("planner"),
    goal: BaseAgent.Goal,
    treeXml: z.string(),
  });

  static readonly #NAVIGATE_TO_URL_EXAMPLE = `
Example:
Input:
Given the following XML accessibility tree:
\`\`\`xml
<link href="http://foo.bar/baz" />
\`\`\`
Outline the actions needed to achieve the following goal: open 'http://foo.bar/baz/123' URL
Output:
Explanation: In order to open URL, I am going to directly navigate to the requested URL.
Actions: ['navigate to "http://foo.bar/baz/123" URL']
`.trim();

  static readonly #UPLOAD_EXAMPLE = `
Example:
Input:
Given the following XML accessibility tree:
\`\`\`xml
<button name="Choose File" />
\`\`\`
Outline the actions needed to achieve the following goal: upload '/tmp/test.txt', '/tmp/image.png'
Output:
Explanation: In order to upload the file, I am going to use the upload action on the file input button.
I don't need to click the button first, as the upload action will handle that.
Actions: ['upload ["/tmp/test.txt", "/tmp/image.png"] to button "Choose File"']
`.trim();

  llm: BaseChatModel;
  toolNames: string[];
  promptWithExamples: FewShotChatMessagePromptTemplate<PlannerAgent.Example>;
  chain: Runnable<PlannerAgent.ChainInput, PlannerAgent.ChainOutput>;

  constructor(llmContext: LlmContext, llm: BaseChatModel, toolNames: string[]) {
    super(llmContext);
    this.llm = llm;

    // Convert tool class names to human-readable names
    // E.g., "NavigateToUrlTool" -> "navigate to url"
    this.toolNames = toolNames.map((tool) =>
      tool
        .replace(/(?<!^)(?=[A-Z])/g, " ")
        .toLowerCase()
        .replace(" tool", ""),
    );

    const examplePrompt = ChatPromptTemplate.fromMessages([
      ["human", this.prompts.user],
      ["ai", "{actions}"],
    ]);
    this.promptWithExamples = new FewShotChatMessagePromptTemplate({
      examples: [],
      examplePrompt,
      inputVariables: [],
    });

    let extraExamples = "";
    if (toolNames.includes(NavigateToUrlTool.name)) {
      extraExamples += `\n\n${PlannerAgent.#NAVIGATE_TO_URL_EXAMPLE}`;
    }
    if (toolNames.includes(UploadTool.name)) {
      extraExamples += `\n\n${PlannerAgent.#UPLOAD_EXAMPLE}`;
    }

    const finalPrompt = ChatPromptTemplate.fromMessages([
      [
        "system",
        pythonicFormat(this.prompts.system, {
          separator: PlannerAgent.#LIST_SEPARATOR,
          tools: this.toolNames.join(", "),
          extra_examples: extraExamples,
        }),
      ],
      // TODO: Apparently FewShotChatMessagePromptTemplate types doesn't work,
      // so we have to cast it to any to prevent type errors. Figure out if this
      // can be fixed.
      this.promptWithExamples as any,
      ["human", this.prompts["user"]],
    ]);

    this.chain = finalPrompt.pipe(
      this.llm.withStructuredOutput(PlannerAgent.Plan, { includeRaw: true }),
    );
  }

  clearExamples(): void {
    this.#extraExamples = this.#baseExamples;
    this.#generateChain();
    logger.info("Examples cleared.");
  }

  addExample(goal: string, actions: string[]) {
    logger.info("Adding example:");
    logger.debug(`  -> Goal: ${goal}`);
    logger.debug(`  -> Actions: ${actions.join(", ")}`);

    let output: string[] | string;
    if (
      PlannerAgent.#UNSTRUCTURED_OUTPUT_MODELS.includes(Model.current.provider)
    ) {
      output = actions.join(PlannerAgent.#LIST_SEPARATOR);
    } else {
      output = actions;
    }

    if (!this.promptWithExamples.examples) {
      this.promptWithExamples.examples = [];
    }

    this.promptWithExamples.examples.push({
      goal,
      accessibility_tree: "",
      actions: output,
    });

    logger.info(
      `Example added. Total examples: ${this.promptWithExamples.examples.length}`,
    );
  }

  /**
   * Plan actions to achieve a goal.
   *
   * @param goal The goal to achieve
   * @param treeXml The accessibility tree XML
   * @returns A tuple of (explanation, actions) where explanation describes
   *   the reasoning and actions is the list of steps to achieve the goal.
   */
  async invoke(goal: string, treeXml: string): Promise<[string, string[]]> {
    logger.info("Starting planning:");
    this.logData(logger, "in", {
      Goal: goal,
      "Accessibility tree": this.debugLogDetail(treeXml),
    });

    const meta: PlannerAgent.Meta = {
      kind: "planner",
      goal: goal as BaseAgent.Goal,
      treeXml,
    };

    const input = {
      goal,
      accessibility_tree: treeXml,
    };
    const result = await this.invokeChain(this.chain, input, meta);

    const structured = result.structured as PlannerAgent.Plan;
    this.logData(logger, "out", {
      Result: structured,
      Usage: result.usage,
    });

    return [
      structured.explanation,
      structured.actions.filter((action) => action),
    ];
  }
}
