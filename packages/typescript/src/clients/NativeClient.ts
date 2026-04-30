import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { always } from "alwaysly";
import { AppId } from "../AppId.ts";
import { LlmUsageStats } from "../llm/llmSchema.ts";
import { Model } from "../Model.ts";
import { AccessibilityTreeDiff } from "../server/accessibility/AccessibilityTreeDiff.ts";
import { ChangesAnalyzerAgent } from "../server/agents/ChangesAnalyzerAgent.ts";
import { RetrieverAgent } from "../server/agents/RetrieverAgent.ts";
import { Session } from "../server/session/Session.ts";
import { SessionManager } from "../server/session/SessionManager.ts";
import { Logger } from "../telemetry/Logger.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Tracer } from "../telemetry/Tracer.ts";
import { convertToolsToSchemas } from "../tools/toolToSchemaConverter.ts";
import { Client } from "./Client.ts";
import { type Data, looselyTypecast } from "./typecasting.ts";

const logger = Logger.get(import.meta.url);
const { tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export namespace NativeClient {
  export interface Props extends Client.Props {
    model: Model;
    llm?: BaseChatModel | undefined;
  }

  export interface RetrieveProps {
    statement: string;
    accessibilityTree: string;
    title: string;
    url: string;
    app: AppId;
    screenshot?: string | undefined;
  }
}

export class NativeClient extends Client {
  #sessionManager: SessionManager;
  session: Session;

  constructor(props: NativeClient.Props) {
    const { llm, model, ...superProps } = props;
    super({ ...superProps });

    logger.debug("Initializing NativeClient with props: {props}", { props });
    logger.info(`Using model: ${model.provider}/${model.name}`);

    this.#sessionManager = new SessionManager();

    const toolSchemas = convertToolsToSchemas(this.tools);

    this.session = this.#sessionManager.createSession({
      provider: model.provider,
      name: model.name,
      tools: toolSchemas,
      platform: this.platform as SessionManager.CreateSessionProps["platform"],
      llm,
      planner: this.planner,
      excludeAttributes: this.excludeAttributes,
    });
  }

  @span("client.get_health", spanAttrs)
  async getHealth(): Promise<Client.Health> {
    return {
      status: "healthy" as const,
    };
  }

  @span("client.get_model", spanAttrs)
  async getModel(): Promise<Model> {
    return this.session.model;
  }

  @span("client.quit", spanAttrs)
  async quit(): Promise<void> {
    this.#sessionManager.deleteSession(this.session.sessionId);
  }

  /**
   * Plan actions to achieve a goal.
   *
   * @returns Object with explanation and steps.
   */
  @span("client.plan_actions", spanAttrs)
  async planActions(
    props: Client.PlanActionsProps,
  ): Promise<Client.PlanActionsResult> {
    const { goal, accessibilityTree, app } = props;
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

  @span("client.add_example", spanAttrs)
  async addExample(props: Client.AddExampleProps): Promise<void> {
    const { goal, actions } = props;
    logger.debug(
      `Adding example. Goal: ${goal}, Actions: ${JSON.stringify(actions)}`,
    );
    this.session.plannerAgent.addExample(goal, actions);
  }

  @span("client.clear_examples", spanAttrs)
  async clearExamples(): Promise<void> {
    this.session.plannerAgent.clearExamples();
  }

  @span("client.execute_action", spanAttrs)
  async executeAction(
    props: Client.ExecuteActionProps,
  ): Promise<Client.ExecuteActionResult> {
    const { goal, step, accessibilityTree, app } = props;
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

  @span("client.retrieve", function (props) {
    return {
      ...spanAttrs.call(this),
      "client.retrieve.args.has_screenshot": !!props.screenshot,
    };
  })
  async retrieve(props: Client.RetrieveProps): Promise<[string, Data]> {
    const { statement, accessibilityTree, title, url, app, screenshot } = props;

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
    return [explanation, looselyTypecast(result)] as [string, Data];
  }

  @span("client.find_area", spanAttrs)
  async findArea(props: Client.FindAreaProps): Promise<Client.FindAreaResult> {
    const { description, accessibilityTree, app } = props;
    this.session.updateContext({ app });

    const tree = this.session.processTree(accessibilityTree);
    const area = await this.session.areaAgent.invoke(
      description,
      tree.toXml(this.session.excludeAttributes),
    );
    return { id: tree.getRawId(area.id), explanation: area.explanation };
  }

  @span("client.find_element", spanAttrs)
  async findElement(
    props: Client.FindElementProps,
  ): Promise<Client.FindElementResult | undefined> {
    const { description, accessibilityTree, app } = props;
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

  @span("client.analyze_changes", spanAttrs)
  async analyzeChanges(props: Client.AnalyzeChangesProps): Promise<string> {
    const {
      beforeAccessibilityTree,
      beforeUrl,
      afterAccessibilityTree,
      afterUrl,
      app,
    } = props;
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

  @span("client.save_cache", spanAttrs)
  async saveCache(): Promise<void> {
    return this.session.cache.save();
  }

  @span("client.discard_cache", spanAttrs)
  async discardCache(): Promise<void> {
    return this.session.cache.discard();
  }

  @span("client.get_stats", spanAttrs)
  async getStats(): Promise<LlmUsageStats> {
    return this.session.stats;
  }
}

function spanAttrs(this: NativeClient): Tracer.SpansClientAttrsBase {
  return {
    "client.kind": "native",
    "session.id": this.session.sessionId,
  };
}
