import type { ToolDefinition } from "@langchain/core/language_models/base";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { always } from "alwaysly";
import { Model } from "../Model.js";
import { AccessibilityTreeDiff } from "../server/accessibility/AccessibilityTreeDiff.js";
import type { UsageStats } from "../server/serverSchema.js";
import { Session } from "../server/session/Session.js";
import type { SessionId } from "../server/session/SessionId.js";
import { SessionManager } from "../server/session/SessionManager.js";
import { ToolClass } from "../tools/BaseTool.js";
import { convertToolsToSchemas } from "../tools/toolToSchemaConverter.js";
import { getLogger } from "../utils/logger.js";
import { Data, looselyTypecast } from "./typecasting.js";

const logger = getLogger(import.meta.url);

export class NativeClient {
  private sessionManager: SessionManager;
  private model: Model;
  private tools: Record<string, ToolClass>;
  private sessionId: SessionId;
  private session: Session;

  constructor(
    model: Model,
    platform: string,
    tools: Record<string, ToolClass>,
    llm?: BaseChatModel,
  ) {
    this.sessionManager = new SessionManager();
    this.model = model;
    this.tools = tools;

    // Convert tools to schemas for API
    const toolSchemas = convertToolsToSchemas(tools);
    this.sessionId = this.sessionManager.createSession({
      provider: this.model.provider,
      name: this.model.name,
      tools: toolSchemas as ToolDefinition[],
      platform: platform as SessionManager.CreateSessionProps["platform"],
      llm,
    });

    const session = this.sessionManager.getSession(this.sessionId);
    always(session);
    this.session = session;
  }

  async quit(): Promise<void> {
    this.sessionManager.deleteSession(this.sessionId);
  }

  /**
   * Plan actions to achieve a goal.
   *
   * @returns Object with explanation and steps.
   */
  async planActions(
    goal: string,
    accessibilityTree: string,
  ): Promise<{ explanation: string; steps: string[] }> {
    const tree = this.session.processTree(accessibilityTree);
    const [explanation, steps] = await this.session.plannerAgent.invoke(
      goal,
      tree.toXml(),
    );
    return { explanation, steps };
  }

  async addExample(goal: string, actions: string[]): Promise<void> {
    logger.debug(
      `Adding example. Goal: ${goal}, Actions: ${JSON.stringify(actions)}`,
    );
    await this.session.plannerAgent.addExample(goal, actions);
  }

  async clearExamples(): Promise<void> {
    this.session.plannerAgent.promptWithExamples.examples = [];
  }

  async executeAction(
    goal: string,
    step: string,
    accessibilityTree: string,
  ): Promise<Array<{ name: string; args: Record<string, unknown> }>> {
    const tree = this.session.processTree(accessibilityTree);
    const actions = await this.session.actorAgent.invoke(
      goal,
      step,
      tree.toXml(),
    );
    always(actions);
    return tree.mapToolCallsToRawId(actions);
  }

  async retrieve(
    statement: string,
    accessibilityTree: string,
    title: string,
    url: string,
    screenshot?: string,
  ): Promise<[string, Data]> {
    const tree = this.session.processTree(accessibilityTree);
    const [explanation, result] = await this.session.retrieverAgent.invoke(
      statement,
      tree.toXml(),
      title,
      url,
      screenshot || null,
    );
    return [explanation, looselyTypecast(result)];
  }

  async findArea(
    description: string,
    accessibilityTree: string,
  ): Promise<{ id: number; explanation: string }> {
    const tree = this.session.processTree(accessibilityTree);
    const area = await this.session.areaAgent.invoke(description, tree.toXml());
    return { id: tree.getRawId(area.id), explanation: area.explanation };
  }

  async findElement(
    description: string,
    accessibilityTree: string,
  ): Promise<{ id: number; explanation: string } | undefined> {
    const tree = this.session.processTree(accessibilityTree);
    const element = (
      await this.session.locatorAgent.invoke(description, tree.toXml())
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
  ): Promise<string> {
    const beforeTree = this.session.processTree(beforeAccessibilityTree);
    const afterTree = this.session.processTree(afterAccessibilityTree);
    const excludeAttrs = new Set(["id"]);
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

  async getStats(): Promise<UsageStats> {
    return this.session.stats;
  }
}
