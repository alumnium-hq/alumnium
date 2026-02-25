import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import {
  AIMessageChunk,
  BaseMessage,
  MessageStructure,
} from "@langchain/core/messages";
import {
  ChatPromptTemplate,
  FewShotChatMessagePromptTemplate,
} from "@langchain/core/prompts";
import { Runnable } from "@langchain/core/runnables";
import { z } from "zod";
import { Model, Provider } from "../../Model.js";
import { pythonicFormat } from "../../pythonic/pythonicFormat.js";
import { NavigateToUrlTool } from "../../tools/NavigateToUrlTool.js";
import { UploadTool } from "../../tools/UploadTool.js";
import { getLogger } from "../../utils/logger.js";
import { Agent } from "./Agent.js";
import { BaseAgent } from "./BaseAgent.js";

const logger = getLogger(import.meta.path);

export class PlannerAgent extends BaseAgent {
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

  static readonly #LIST_SEPARATOR = "<SEP>";
  static readonly #UNSTRUCTURED_OUTPUT_MODELS = [Provider.OLLAMA];

  llm: BaseChatModel;
  toolNames: string[];
  promptWithExamples: FewShotChatMessagePromptTemplate<PlannerAgent.Example>;
  chain: Runnable<PlannerAgent.ChainInput, PlannerAgent.ChainOutput>;

  constructor(llm: BaseChatModel, tools: string[]) {
    super();
    this.llm = llm;

    // Convert tool class names to human-readable names
    // E.g., "NavigateToUrlTool" -> "navigate to url"
    this.toolNames = tools.map((tool) =>
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
      inputVariables: PlannerAgent.Example.keyof().options,
    });

    let extraExamples = "";
    if (tools.includes(NavigateToUrlTool.name)) {
      extraExamples += `\n\n${PlannerAgent.#NAVIGATE_TO_URL_EXAMPLE}`;
    }
    if (tools.includes(UploadTool.name)) {
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

    if (
      !PlannerAgent.#UNSTRUCTURED_OUTPUT_MODELS.includes(Model.current.provider)
    ) {
      this.chain = finalPrompt.pipe(
        llm.withStructuredOutput(PlannerAgent.Plan, { includeRaw: true }),
      );
    } else {
      this.chain = finalPrompt.pipe(llm);
    }
  }

  addExample(goal: string, actions: string[]) {
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
  }

  /**
   * Plan actions to achieve a goal.
   *
   * @param goal The goal to achieve
   * @param accessibilityTreeXml The accessibility tree XML
   * @returns A tuple of (explanation, actions) where explanation describes
   *   the reasoning and actions is the list of steps to achieve the goal.
   */
  async invoke(
    goal: string,
    accessibilityTreeXml: string,
  ): Promise<[string, string[]]> {
    logger.info("Starting planning:");
    this.logData(logger, "in", {
      Goal: goal,
      "Accessibility tree": this.debugLogValue(accessibilityTreeXml),
    });

    const message = await this.invokeChain(this.chain, {
      goal,
      accessibility_tree: accessibilityTreeXml,
    });

    if ("parsed" in message) {
      const response = message.parsed;
      this.logData(logger, "out", {
        Result: response,
        Usage: BaseAgent.getMessageUsage(message.raw),
      });

      return [
        response.explanation,
        response.actions.filter((action) => action),
      ];
    }

    this.logData(logger, "out", {
      Result: message.content,
      Usage: message.usage_metadata,
    });

    let response = message.content;

    // TODO: Figure out if LangChain JS and Python have different content types
    // or Python simply assumes content is always string. If the latter, we can
    // replace this with an assertion.
    if (!(typeof response === "string")) {
      logger.warn(
        "Received non-string response in unstructured output mode, returning empty plan.",
      );
      return ["", []];
    }

    response = response.trim();

    if (response.startsWith(PlannerAgent.#LIST_SEPARATOR)) {
      response = response.slice(PlannerAgent.#LIST_SEPARATOR.length);
    }
    if (response.endsWith(PlannerAgent.#LIST_SEPARATOR)) {
      response = response.slice(0, -PlannerAgent.#LIST_SEPARATOR.length);
    }

    const steps: string[] = [];
    for (let step of response.split(PlannerAgent.#LIST_SEPARATOR)) {
      step = step.trim();
      if (step && step.toUpperCase() !== "NOOP") {
        steps.push(step);
      }
    }

    return ["", steps];
  }

  //#region State

  static createState(): PlannerAgent.State {
    return {
      ...Agent.createState(),
      examples: [],
    };
  }

  toState(): PlannerAgent.State {
    const state = super.toState();
    const examples = this.promptWithExamples.examples;
    return {
      ...state,
      examples: examples
        ? // NOTE: LangChain has broken generic types for examples, so they
          // never resolve properly.
          (examples as PlannerAgent.Example[])
        : [],
    };
  }

  applyState(state: PlannerAgent.State): void {
    super.applyState(state);
    this.promptWithExamples.examples = state["examples"];
  }

  //#endregion
}

export namespace PlannerAgent {
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

  export const Example = z.object({
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

  export type Example = z.infer<typeof PlannerAgent.Example>;

  export const State = Agent.State.extend({
    examples: z.array(PlannerAgent.Example),
  });

  export type State = z.infer<typeof PlannerAgent.State>;

  export const Plan = z.object({
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

  export type Plan = z.infer<typeof PlannerAgent.Plan>;
}
