import { always } from "alwaysly";
import { AppId } from "../AppId.ts";
import { LlmUsageStats } from "../llm/llmSchema.ts";
import { Model } from "../Model.ts";
import { Params } from "../Params.ts";
import { AccessibilityTreeDiff } from "../server/accessibility/AccessibilityTreeDiff.ts";
import { ChangesAnalyzerAgent } from "../server/agents/ChangesAnalyzerAgent.ts";
import { RetrieverAgent } from "../server/agents/RetrieverAgent.ts";
import { Session } from "../server/session/Session.ts";
import { SessionManager } from "../server/session/SessionManager.ts";
import { Logger } from "../telemetry/Logger.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Tracer } from "../telemetry/Tracer.ts";
import { convertToolsToSchemas } from "../tools/index.ts";
import { Client } from "./Client.ts";
import { type Data, looselyTypecast } from "./typecasting.ts";

const logger = Logger.get(import.meta.url);
const { tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export namespace NativeClient {
  export interface Props extends Client.Props {
    model: Model;
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
  readonly session: Promise<Session>;

  constructor(props: NativeClient.Props) {
    const { model, ...superProps } = props;
    super({ ...superProps });

    logger.debug("Initializing NativeClient with props: {props}", { props });
    logger.info(`Using model: ${model.provider}/${model.name}`);

    this.#sessionManager = new SessionManager();

    const toolSchemas = convertToolsToSchemas(this.tools);

    this.session = this.#sessionManager.createSession({
      model,
      tools: toolSchemas,
      platform: this.platform,
      driver: this.driver,
      planner: this.planner,
      excludeAttributes: this.excludeAttributes,
    });
    // NOTE: Failures surface when the session is awaited.
    this.session.catch(() => {});
  }

  @span("client.get_health", spanAttrs)
  async getHealth(): Promise<Client.Health> {
    return {
      status: "healthy" as const,
    };
  }

  @span("client.get_model", spanAttrs)
  async getModel(): Promise<Model> {
    const session = await this.session;
    return session.model;
  }

  @span("client.quit", spanAttrs)
  async quit(): Promise<void> {
    const session = await this.session;
    await this.#sessionManager.deleteSession(session.sessionId);
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
    const session = await this.session;
    const { goal, accessibilityTree, app, screenshot, params, cache } = props;
    session.updateContext({ app });

    if (!session.planner) {
      return { explanation: goal, steps: [goal] };
    }

    const tree = session.parseTree(accessibilityTree);
    const [explanation, steps] = await session.plannerAgent.invoke(
      goal,
      tree.toXml(session.excludeAttributes),
      screenshot,
      params,
      cache,
    );
    return { explanation, steps };
  }

  @span("client.add_example", spanAttrs)
  async addExample(props: Client.AddExampleProps): Promise<void> {
    const session = await this.session;
    const { goal, actions } = props;
    logger.debug(
      `Adding example. Goal: ${goal}, Actions: ${JSON.stringify(actions)}`,
    );
    session.plannerAgent.addExample(goal, actions);
  }

  @span("client.clear_examples", spanAttrs)
  async clearExamples(): Promise<void> {
    const session = await this.session;
    session.plannerAgent.clearExamples();
  }

  @span("client.execute_action", spanAttrs)
  async executeAction(
    props: Client.ExecuteActionProps,
  ): Promise<Client.ExecuteActionResult> {
    const session = await this.session;
    const { goal, step, accessibilityTree, app, screenshot, params, cache } =
      props;
    session.updateContext({ app });

    const tree = session.parseTree(accessibilityTree);
    const [explanation, actions] = await session.actorAgent.invoke(
      goal,
      step,
      tree.toXml(session.excludeAttributes),
      screenshot,
      params,
      cache,
    );
    return {
      explanation,
      actions: tree.mapToolCallsToRawId(actions),
    };
  }

  @span("client.retrieve", async function (props) {
    return {
      ...(await spanAttrs.call(this)),
      "client.retrieve.args.has_screenshot": !!props.screenshot,
    };
  })
  async retrieve(props: Client.RetrieveProps): Promise<[string, Data]> {
    const session = await this.session;
    const {
      statement,
      accessibilityTree,
      title,
      url,
      app,
      screenshot,
      params,
      cache,
    } = props;

    session.updateContext({ app });

    const tree = session.parseTree(accessibilityTree);
    const excludeAttrs = new Set([
      ...RetrieverAgent.EXCLUDE_ATTRIBUTES,
      ...session.excludeAttributes,
    ]);
    const [explanation, result] = await session.retrieverAgent.invoke({
      statement: Params.substitute(statement, params),
      treeXml: tree.toXml(excludeAttrs),
      title,
      url,
      screenshot: screenshot || null,
      cache,
    });
    return [explanation, looselyTypecast(result)] as [string, Data];
  }

  @span("client.find_area", spanAttrs)
  async findArea(props: Client.FindAreaProps): Promise<Client.FindAreaResult> {
    const session = await this.session;
    const { description, accessibilityTree, app } = props;
    session.updateContext({ app });

    const tree = session.parseTree(accessibilityTree);
    const area = await session.areaAgent.invoke(
      description,
      tree.toXml(session.excludeAttributes),
    );
    return { id: tree.getRawId(area.id), explanation: area.explanation };
  }

  @span("client.find_element", spanAttrs)
  async findElement(
    props: Client.FindElementProps,
  ): Promise<Client.FindElementResult | undefined> {
    const session = await this.session;
    const { description, accessibilityTree, app, cache } = props;
    session.updateContext({ app });

    const tree = session.parseTree(accessibilityTree);
    const element = (
      await session.locatorAgent.invoke(
        description,
        tree.toXml(session.excludeAttributes),
        cache,
      )
    )[0];
    always(element);
    element.id = tree.getRawId(element.id);
    return element;
  }

  @span("client.analyze_changes", spanAttrs)
  async analyzeChanges(props: Client.AnalyzeChangesProps): Promise<string> {
    const session = await this.session;
    const {
      beforeAccessibilityTree,
      beforeUrl,
      afterAccessibilityTree,
      afterUrl,
      app,
      cache,
    } = props;
    session.updateContext({ app });

    const beforeTree = session.parseTree(beforeAccessibilityTree);
    const afterTree = session.parseTree(afterAccessibilityTree);
    const excludeAttrs = new Set([
      ...ChangesAnalyzerAgent.EXCLUDE_ATTRIBUTES,
      ...session.excludeAttributes,
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

    analysis += await session.changesAnalyzerAgent.invoke(
      diff.compute(),
      cache,
    );
    return analysis;
  }

  @span("client.save_cache", spanAttrs)
  async saveCache(): Promise<void> {
    const session = await this.session;
    return session.cache.save();
  }

  @span("client.discard_cache", spanAttrs)
  async discardCache(): Promise<void> {
    const session = await this.session;
    return session.cache.discard();
  }

  @span("client.get_stats", spanAttrs)
  async getStats(): Promise<LlmUsageStats> {
    const session = await this.session;
    return session.stats;
  }
}

async function spanAttrs(
  this: NativeClient,
): Promise<Tracer.SpansClientAttrsBase> {
  return {
    "client.kind": "native",
    "session.id": (await this.session).sessionId,
  };
}
