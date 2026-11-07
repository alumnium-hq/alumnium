import type { LanguageModelV4 } from "@ai-sdk/provider";
import z from "zod";
import { AppId } from "../../AppId.ts";
import { Driver } from "../../drivers/Driver.ts";
import { Env } from "../../Env.ts";
import type { LanguageModel } from "../../llm/LanguageModel.ts";
import {
  createLlmUsage,
  LlmUsage,
  LlmUsageStats,
} from "../../llm/llmSchema.ts";
import { loadAi } from "../../llm/loadAi.ts";
import { Model } from "../../Model.ts";
import { Logger } from "../../telemetry/Logger.ts";
import type { ToolDefinition } from "../../tools/ToolDefinition.ts";
import { TreeFactory } from "../../tree/TreeFactory.ts";
import { BaseServerAccessibilityTree } from "../accessibility/BaseServerAccessibilityTree.ts";
import { ActorAgent } from "../agents/ActorAgent.ts";
import { AreaAgent } from "../agents/AreaAgent.ts";
import type { BaseAgent } from "../agents/BaseAgent.ts";
import { ChangesAnalyzerAgent } from "../agents/ChangesAnalyzerAgent.ts";
import { LocatorAgent } from "../agents/LocatorAgent.ts";
import { PlannerAgent } from "../agents/PlannerAgent.ts";
import { RetrieverAgent } from "../agents/RetrieverAgent.ts";
import { createCacheMiddleware } from "../cache/CacheMiddleware.ts";
import { ServerCache } from "../cache/ServerCache.ts";
import { CacheFactory } from "../CacheFactory.ts";
import { Knowledge } from "../knowledge/Knowledge.ts";
import { KnowledgeLayer } from "../knowledge/KnowledgeLayer.ts";
import { KnowledgeManifest } from "../knowledge/KnowledgeManifest.ts";
import { KnowledgeRelevance } from "../knowledge/KnowledgeRelevance.ts";
import { KnowledgeStore } from "../knowledge/KnowledgeStore.ts";
import { SessionContext } from "./SessionContext.ts";
import { SessionId } from "./SessionId.ts";

const logger = Logger.get(import.meta.url);

export namespace Session {
  export interface Props {
    app?: AppId | undefined;
    sessionId: SessionId;
    model: Model;
    platform: Driver.Platform;
    // Optional since Java/Python only support Appium.
    driver?: Driver.Kind | undefined;
    tools: ToolDefinition[];
    planner?: boolean | undefined;
    excludeAttributes?: Set<string> | undefined;
    /** Knowledge scope, `ALUMNIUM_KNOWLEDGE_SCOPE` by default. */
    knowledge?: string | undefined;
  }
}

/**
 * Represents a client session with its own agent instances.
 */
export class Session {
  static Id = z.custom<SessionId>((val) => typeof val === "string", {
    message: "Invalid session ID",
  });

  static defaultDriver(platform: Driver.Platform): Driver.Kind {
    return platform === "chromium" || platform === "firefox"
      ? "selenium"
      : "appium";
  }

  sessionId: SessionId;
  model: Model;
  platform: Driver.Platform;
  driver: Driver.Kind;
  tools: ToolDefinition[];
  #llm: LanguageModel | undefined;
  cache: ServerCache;
  knowledge: Knowledge;
  planner: boolean;
  excludeAttributes: Set<string>;
  #context: SessionContext;

  #actorAgent: ActorAgent | undefined;
  #plannerAgent: PlannerAgent | undefined;
  #retrieverAgent: RetrieverAgent | undefined;
  #areaAgent: AreaAgent | undefined;
  #locatorAgent: LocatorAgent | undefined;
  #changesAnalyzerAgent: ChangesAnalyzerAgent | undefined;

  constructor(props: Session.Props) {
    const { sessionId, model, platform, app, tools } = props;
    this.sessionId = sessionId;
    this.model = model;
    this.platform = platform;
    this.driver = props.driver ?? Session.defaultDriver(platform);
    this.tools = tools;
    this.planner = props.planner ?? true;
    this.excludeAttributes = props.excludeAttributes ?? new Set();
    this.#context = new SessionContext({ app, sessionId });
    this.cache = CacheFactory.createCache(this.#context, model);
    this.knowledge = new Knowledge({
      context: this.#context,
      store: Env.ALUMNIUM_KNOWLEDGE ? new KnowledgeStore() : null,
      platform: KnowledgeLayer.platform(this.platform),
      scope: KnowledgeManifest.Name.optional().parse(
        props.knowledge ?? Env.ALUMNIUM_KNOWLEDGE_SCOPE,
      ),
    });

    logger.info(
      `Created session ${sessionId} with model ${model.provider}/${model.name} and platform ${platform}`,
    );
  }

  get llm(): LanguageModel {
    return (this.#llm ??= wrapLanguageModelLazily({
      model: this.#createLlm(),
      middleware: createCacheMiddleware(this.cache),
    }));
  }

  #createLlm(): LanguageModel {
    if (!Model.hasProvider(this.model))
      throw Model.missingProviderError(this.model);
    return this.model.createLlm();
  }

  get actorAgent(): ActorAgent {
    return (this.#actorAgent ??= new ActorAgent(
      this.model,
      this.llm,
      this.tools,
    ));
  }

  get plannerAgent(): PlannerAgent {
    return (this.#plannerAgent ??= new PlannerAgent(
      this.model,
      this.llm,
      this.tools.map((schema) => schema.function.name),
    ));
  }

  get retrieverAgent(): RetrieverAgent {
    return (this.#retrieverAgent ??= new RetrieverAgent(this.model, this.llm));
  }

  get areaAgent(): AreaAgent {
    return (this.#areaAgent ??= new AreaAgent(this.model, this.llm));
  }

  get locatorAgent(): LocatorAgent {
    return (this.#locatorAgent ??= new LocatorAgent(this.model, this.llm));
  }

  get changesAnalyzerAgent(): ChangesAnalyzerAgent {
    return (this.#changesAnalyzerAgent ??= new ChangesAnalyzerAgent(
      this.model,
      this.llm,
    ));
  }

  /**
   * Learns actions to achieve the goal, persisting them in the layer.
   *
   * @param options App the example was learned on and layer to persist in.
   */
  addExample(
    goal: string,
    actions: string[],
    options: Knowledge.LearnOptions = {},
  ): Promise<void> {
    return this.knowledge.learn("do", goal, actions, options);
  }

  /**
   * Learns a hint on how to handle the instruction, persisting it in the
   * layer.
   *
   * @param options App the hint was learned on and layer to persist in.
   */
  addHint(
    kind: Knowledge.HintKind,
    instruction: string,
    hint: string,
    options: Knowledge.LearnOptions = {},
  ): Promise<void> {
    return this.knowledge.learn(kind, instruction, hint, options);
  }

  /**
   * Forgets a lesson in the layer, the product layer by default.
   *
   * @returns Whether a lesson was forgotten.
   */
  forgetLesson(
    kind: Knowledge.Kind,
    instruction: string,
    layer?: Knowledge.Layer,
  ): Promise<boolean> {
    return this.knowledge.forget(kind, instruction, layer);
  }

  /** Forgets all lessons of the layer, the product layer by default. */
  clearLayer(layer?: Knowledge.Layer): Promise<void> {
    return this.knowledge.clearLayer(layer);
  }

  /** Forgets lessons learned in the session. Persisted lessons are kept. */
  async clearExamples(): Promise<void> {
    this.knowledge.clearSession();
  }

  /** Provides the planner with examples relevant to the goal. */
  async syncExamples(goal: string): Promise<void> {
    const examples = Session.#select(await this.knowledge.lessons("do"), goal);
    this.plannerAgent.setExamples(
      examples.map(({ instruction, value }) => [instruction, value]),
    );
  }

  /** Provides the agent with hints relevant to the instruction. */
  async syncHints(
    agent: "retriever" | "locator" | "area",
    instruction: string,
  ): Promise<void> {
    switch (agent) {
      case "retriever": {
        const hints = await this.#hints(instruction, "get", "check");
        this.retrieverAgent.setHints(hints);
        return;
      }

      case "locator": {
        const hints = await this.#hints(instruction, "find");
        this.locatorAgent.setHints(hints);
        return;
      }

      case "area": {
        const hints = await this.#hints(instruction, "area");
        this.areaAgent.setHints(hints);
        return;
      }
    }
  }

  /** Selects the hints of each kind relevant to the instruction. */
  async #hints(
    instruction: string,
    ...kinds: Knowledge.HintKind[]
  ): Promise<BaseAgent.Hint[]> {
    const hints: BaseAgent.Hint[] = [];
    for (const kind of kinds) {
      const lessons = await this.knowledge.lessons(kind);
      for (const { instruction: lesson, value } of Session.#select(
        lessons,
        instruction,
      )) {
        hints.push({ kind, instruction: lesson, hint: value });
      }
    }
    return hints;
  }

  static #select<Value>(
    lessons: Map<string, Value>,
    instruction: string,
  ): KnowledgeRelevance.Scored<Value>[] {
    return KnowledgeRelevance.select(
      lessons,
      instruction,
      Env.ALUMNIUM_KNOWLEDGE_TOP_K,
    );
  }

  /** Ends the session, warning about lessons that were never persisted. */
  close(): void {
    const unsaved = this.knowledge.unsaved();
    if (!unsaved.length) return;

    const lessons = unsaved
      .map(
        ({ kind, instruction, layer }) => `${kind} "${instruction}" (${layer})`,
      )
      .join(", ");
    logger.warn(
      `Session ${this.sessionId} ended with ${unsaved.length} lesson(s) never persisted, because no app was known: ${lessons}. Navigate before the first action, or set a knowledge scope with the \`knowledge\` option or ALUMNIUM_KNOWLEDGE_SCOPE.`,
    );
  }

  updateContext(props: SessionContext.UpdateProps): void {
    this.#context.update(props);
  }

  get app(): AppId {
    return this.#context.app;
  }

  set app(appId: AppId) {
    this.updateContext({ app: appId });
  }

  /**
   * Provides statistics about the usage of tokens.
   *
   * @returns Session usage statistics.
   */
  get stats(): LlmUsageStats {
    const usageStats: LlmUsageStats = {
      total: createLlmUsage(),
      cache: this.cache.usage,
    };

    const agents = [
      this.#plannerAgent,
      this.#actorAgent,
      this.#retrieverAgent,
      this.#areaAgent,
      this.#locatorAgent,
      this.#changesAnalyzerAgent,
    ];

    agents.forEach((agent) => {
      if (!agent) return;

      (Object.keys(usageStats.total) as (keyof LlmUsage)[]).forEach((key) => {
        usageStats.total[key] += agent.usage[key];
      });
    });

    return usageStats;
  }

  /**
   * Processes accessibility tree XML into a server tree.
   *
   * @param xml Accessibility tree XML
   * @returns The created server tree instance
   */
  parseTree(xml: string): BaseServerAccessibilityTree {
    const tree = TreeFactory.create(this.platform, this.driver, xml);
    logger.debug(`Processed tree for session ${this.sessionId}`);
    return tree;
  }

  static createId(): SessionId {
    return crypto.randomUUID() as SessionId;
  }
}

/**
 * Wraps a model with middleware once `ai` is loaded on the first call, so
 * sessions are created synchronously without loading `ai` upfront.
 */
function wrapLanguageModelLazily(props: {
  model: LanguageModel;
  middleware: ReturnType<typeof createCacheMiddleware>;
}): LanguageModelV4 {
  const { model, middleware } = props;
  let wrapped: Promise<LanguageModelV4> | undefined;
  const getWrapped = () =>
    (wrapped ??= loadAi().then(({ wrapLanguageModel }) =>
      wrapLanguageModel({ model, middleware }),
    ));

  return {
    specificationVersion: "v4",
    provider: model.provider,
    modelId: model.modelId,
    supportedUrls: model.supportedUrls,
    doGenerate: async (options) => (await getWrapped()).doGenerate(options),
    doStream: async (options) => (await getWrapped()).doStream(options),
  };
}
