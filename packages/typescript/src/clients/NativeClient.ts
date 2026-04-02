import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { always } from "alwaysly";
import { AppId } from "../AppId.ts";
import { LlmUsageStats } from "../llm/llmSchema.ts";
import { AccessibilityTreeDiff } from "../server/accessibility/AccessibilityTreeDiff.ts";
import { ChangesAnalyzerAgent } from "../server/agents/ChangesAnalyzerAgent.ts";
import { RetrieverAgent } from "../server/agents/RetrieverAgent.ts";
import { Session } from "../server/session/Session.ts";
import { SessionManager } from "../server/session/SessionManager.ts";
import { convertToolsToSchemas } from "../tools/toolToSchemaConverter.ts";
import { getLogger } from "../utils/logger.ts";
import { Client } from "./Client.ts";
import { type Data, looselyTypecast } from "./typecasting.ts";

const logger = getLogger(import.meta.url);

export namespace NativeClient {
  export interface Props extends Client.Props {
    llm?: BaseChatModel | undefined;
  }
}

export class NativeClient extends Client {
  #sessionManager: SessionManager;
  session: Session;

  constructor(props: NativeClient.Props) {
    const { llm, ...superProps } = props;
    super(superProps);

    this.#sessionManager = new SessionManager();

    const toolSchemas = convertToolsToSchemas(this.tools);
    this.session = this.#sessionManager.createSession({
      provider: this.model.provider,
      name: this.model.name,
      tools: toolSchemas,
      platform: this.platform as SessionManager.CreateSessionProps["platform"],
      llm,
      planner: this.planner,
      excludeAttributes: this.excludeAttributes,
    });
  }

  async quit(): Promise<void> {
    this.#sessionManager.deleteSession(this.session.sessionId);
  }

  /**
   * Plan actions to achieve a goal.
   *
   * @returns Object with explanation and steps.
   */
  async planActions(
    goal: string,
    accessibilityTree: string,
    app: AppId,
  ): Promise<Client.PlanActionsResult> {
    this.session.updateContext({ app });

    if (!this.session.planner) {
      return { explanation: goal, steps: [goal] };
    }

    const tree = this.session.processTree(accessibilityTree);
    const [explanation, steps] = await this.session.plannerAgent.invoke(
      goal,
      tree.toXml(this.session.excludeAttributes),
    );
    return { explanation, steps };
  }

  async addExample(goal: string, actions: string[]): Promise<void> {
    logger.debug(
      `Adding example. Goal: ${goal}, Actions: ${JSON.stringify(actions)}`,
    );
    this.session.plannerAgent.addExample(goal, actions);
  }

  async clearExamples(): Promise<void> {
    this.session.plannerAgent.promptWithExamples.examples = [];
  }

  async executeAction(
    goal: string,
    step: string,
    accessibilityTree: string,
    app: AppId,
  ): Promise<Client.ExecuteActionResult> {
    this.session.updateContext({ app });

    const tree = this.session.processTree(accessibilityTree);
    const [explanation, actions] = await this.session.actorAgent.invoke(
      goal,
      step,
      tree.toXml(this.session.excludeAttributes),
    );
    return {
      explanation,
      actions: tree.mapToolCallsToRawId(actions),
    };
  }

  async retrieve(
    statement: string,
    accessibilityTree: string,
    title: string,
    url: string,
    app: AppId,
    screenshot?: string,
  ): Promise<[string, Data]> {
    this.session.updateContext({ app });

    const tree = this.session.processTree(accessibilityTree);
    const excludeAttrs = new Set([
      ...RetrieverAgent.EXCLUDE_ATTRIBUTES,
      ...this.session.excludeAttributes,
    ]);
    const [explanation, result] = await this.session.retrieverAgent.invoke(
      statement,
      tree.toXml(excludeAttrs),
      title,
      url,
      screenshot || null,
    );
    return [explanation, looselyTypecast(result)];
  }

  async findArea(
    description: string,
    accessibilityTree: string,
    app: AppId,
  ): Promise<Client.FindAreaResult> {
    this.session.updateContext({ app });

    const tree = this.session.processTree(accessibilityTree);
    const area = await this.session.areaAgent.invoke(
      description,
      tree.toXml(this.session.excludeAttributes),
    );
    return { id: tree.getRawId(area.id), explanation: area.explanation };
  }

  async findElement(
    description: string,
    accessibilityTree: string,
    app: AppId,
  ): Promise<Client.FindElementResult | undefined> {
    this.session.updateContext({ app });

    const tree = this.session.processTree(accessibilityTree);
    const element = (
      await this.session.locatorAgent.invoke(
        description,
        tree.toXml(this.session.excludeAttributes),
      )
    )[0];
    always(element);
    element.id = tree.getRawId(element.id);
    return element;
  }

  async analyzeChanges(
    beforeAccessibilityTree: string,
    beforeUrl: string,
    afterAccessibilityTree: string,
    afterUrl: string,
    app: AppId,
  ): Promise<string> {
    this.session.updateContext({ app });

    const beforeTree = this.session.processTree(beforeAccessibilityTree);
    const afterTree = this.session.processTree(afterAccessibilityTree);
    const excludeAttrs = new Set([
      ...ChangesAnalyzerAgent.EXCLUDE_ATTRIBUTES,
      ...this.session.excludeAttributes,
    ]);
    const diff = new AccessibilityTreeDiff(
      beforeTree.toXml(excludeAttrs),
      afterTree.toXml(excludeAttrs),
    );

    let analysis = "";
    if (beforeUrl && afterUrl) {
      if (beforeUrl !== afterUrl) {
        analysis = `URL changed to ${afterUrl}. `;
      } else {
        analysis = "URL did not change. ";
      }
    }

    analysis += await this.session.changesAnalyzerAgent.invoke(diff.compute());
    return analysis;
  }

  async saveCache(): Promise<void> {
    await this.session.cache.save();
  }

  async discardCache(): Promise<void> {
    await this.session.cache.discard();
  }

  async getStats(): Promise<LlmUsageStats> {
    return this.session.stats;
  }
}
