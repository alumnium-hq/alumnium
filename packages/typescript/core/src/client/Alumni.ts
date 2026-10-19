import { always } from "alwaysly";
import { Client } from "../clients/Client.ts";
import { HttpClient } from "../clients/HttpClient.ts";
import { NativeClient } from "../clients/NativeClient.ts";
import type { Data } from "../clients/typecasting.ts";
import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { Env } from "../Env.ts";
import { LlmUsageStats } from "../llm/llmSchema.ts";
import { Model } from "../Model.ts";
import { NavigationPolicy } from "../NavigationPolicy.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { Tracer } from "../telemetry/Tracer.ts";
import { BaseTool, type ToolClass } from "../tools/BaseTool.ts";
import { retry } from "../utils/retry.ts";
import { Area } from "./Area.ts";
import { Cache } from "./Cache.ts";
import { AssertionError } from "./errors/AssertionError.ts";
import type { DoResult, DoStep } from "./result.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export namespace Alumni {
  export interface Options {
    url?: string | undefined;
    model?: Model | Model.WithProvider | undefined;
    extraTools?: ToolClass[];
    disabledTools?: string[] | undefined;
    planner?: boolean | undefined;
    changeAnalysis?: boolean | undefined;
    excludeAttributes?: string[] | undefined;
    navigationPolicy?: NavigationPolicy.Options | undefined;
  }

  export interface VisionOptions {
    vision?: boolean;
  }

  export interface CheckOptions extends VisionOptions {
    assert?: CheckAssert;
  }

  export type CheckAssert = (
    expression: any,
    message?: string,
  ) => asserts expression;
}

/**
 * Driver-agnostic Alumni operating on a wrapped `BaseDriver`. Driver packages
 * (e.g. `@alumnium/playwright`) and `alumnium` export subclasses accepting
 * native drivers.
 */
export class Alumni<TDriver extends BaseDriver = BaseDriver> {
  public driver: TDriver;
  client: Client;
  readonly disabledTools: ReadonlySet<string>;

  private tools: Record<string, ToolClass> = {};
  public cache: Cache;
  private changeAnalysis: boolean;

  constructor(driver: TDriver, options: Alumni.Options = {}) {
    logger.debug("Initializing Alumni with options: {options}", { options });

    const { url, model } = options;

    this.changeAnalysis =
      options.changeAnalysis ?? Env.ALUMNIUM_CHANGE_ANALYSIS;

    this.driver = driver;

    this.driver.navigationPolicy = NavigationPolicy.create(
      options.navigationPolicy ?? {},
    );

    const tools = this.driver.supportedTools.union(new Set(options.extraTools));
    this.disabledTools = new Set(options.disabledTools);
    for (const tool of tools) {
      if (!this.disabledTools.has(tool.name)) this.tools[tool.name] = tool;
    }

    const planner = options.planner ?? Env.ALUMNIUM_PLANNER;

    const clientProps: Client.Props = {
      platform: this.driver.platform,
      driver: this.driver.kind,
      tools: this.tools,
      planner,
      excludeAttributes:
        options.excludeAttributes ?? Env.ALUMNIUM_EXCLUDE_ATTRIBUTES,
    };

    if (url) {
      logger.info(`Using HTTP client with server: ${url}`);
      this.client = new HttpClient({
        baseUrl: url,
        model,
        ...clientProps,
      });
    } else {
      this.client = new NativeClient({
        model: model || Env.ALUMNIUM_MODEL,
        ...clientProps,
      });
    }

    this.cache = new Cache(this.client);
  }

  @span("alumni.model", spanAttrs)
  model(): Promise<Model> {
    return this.client.getModel();
  }

  @span("alumni.quit", spanAttrs)
  async quit(): Promise<void> {
    await this.client.quit();
    await this.driver.quit();
  }

  @span("alumni.do", (_, options) => ({
    "alumni.flavor": "alumni",
    "alumni.method.args.vision": !!options?.vision,
  }))
  async do(
    goal: string,
    options: Alumni.VisionOptions = {},
  ): Promise<DoResult> {
    return retry(async () => {
      const app = await this.driver.app();

      this.driver.resetAccessibilityTree();
      const initialAccessibilityTree = await this.driver.getAccessibilityTree();
      const beforeTree = this.changeAnalysis
        ? await initialAccessibilityTree.toStr()
        : null;
      const beforeUrl = this.changeAnalysis ? await this.driver.url() : null;
      const { explanation, steps } = await this.client.planActions({
        goal,
        accessibilityTree: await initialAccessibilityTree.toStr(),
        app,
        screenshot: options.vision ? await this.driver.screenshot() : undefined,
      });

      let finalExplanation = explanation;
      const executedSteps: DoStep[] = [];
      for (let idx = 0; idx < steps.length; idx++) {
        const step = steps[idx];
        always(step);

        // Use initial tree for first step, fresh tree for subsequent steps.
        if (idx > 0) this.driver.resetAccessibilityTree();
        const accessibilityTree = await this.driver.getAccessibilityTree();
        const screenshot = options.vision
          ? await this.driver.screenshot()
          : undefined;
        const { explanation: actorExplanation, actions } =
          await this.client.executeAction({
            goal,
            step,
            accessibilityTree: await accessibilityTree.toStr(),
            app,
            screenshot,
          });

        // When planner is off, explanation is just the goal — replace with actor's reasoning.
        if (finalExplanation === goal) {
          finalExplanation = actorExplanation;
        }

        const calledTools: string[] = [];
        for (const toolCall of actions) {
          const calledTool = await BaseTool.executeToolCall(
            toolCall,
            this.tools,
            this.driver,
          );
          calledTools.push(calledTool);
        }

        executedSteps.push({ name: step, tools: calledTools });
      }

      let changes = "";
      if (this.changeAnalysis && executedSteps.length > 0) {
        this.driver.resetAccessibilityTree();
        changes = await this.client.analyzeChanges({
          beforeAccessibilityTree: beforeTree!,
          beforeUrl: beforeUrl!,
          afterAccessibilityTree: await (
            await this.driver.getAccessibilityTree()
          ).toStr(),
          afterUrl: await this.driver.url(),
          app,
        });
      }

      return {
        explanation: finalExplanation,
        steps: executedSteps,
        changes,
      };
    });
  }

  @span("alumni.check", (_, options) => ({
    "alumni.flavor": "alumni",
    "alumni.method.args.vision": !!options?.vision,
  }))
  async check(
    statement: string,
    options: Alumni.CheckOptions = {},
  ): Promise<string> {
    return retry(async () => {
      const screenshot = options.vision
        ? await this.driver.screenshot()
        : undefined;
      this.driver.resetAccessibilityTree();
      const accessibilityTree = await this.driver.getAccessibilityTree();
      const [explanation, value] = await this.client.retrieve({
        statement: `Is the following true or false - ${statement}`,
        accessibilityTree: await accessibilityTree.toStr(),
        title: await this.driver.title(),
        url: await this.driver.url(),
        app: await this.driver.app(),
        screenshot,
      });

      if (!value || !explanation) {
        const { assert } = options;
        if (assert) {
          (assert as any)(false, explanation);
        } else {
          throw new AssertionError(explanation);
        }
      }

      return explanation;
    });
  }

  @span("alumni.get", (_, options) => ({
    "alumni.flavor": "alumni",
    "alumni.method.args.vision": !!options?.vision,
  }))
  async get(data: string, options: Alumni.VisionOptions = {}): Promise<Data> {
    return retry(async () => {
      const screenshot = options.vision
        ? await this.driver.screenshot()
        : undefined;
      this.driver.resetAccessibilityTree();
      const accessibilityTree = await this.driver.getAccessibilityTree();
      const [explanation, value] = await this.client.retrieve({
        statement: data,
        accessibilityTree: await accessibilityTree.toStr(),
        title: await this.driver.title(),
        url: await this.driver.url(),
        app: await this.driver.app(),
        screenshot,
      });

      return value === null ? explanation : value;
    });
  }

  @span("alumni.find", spanAttrs)
  async find(
    description: string,
  ): Promise<BaseDriver.ElementOf<TDriver> | undefined> {
    return retry(async () => {
      this.driver.resetAccessibilityTree();
      const accessibilityTree = await this.driver.getAccessibilityTree();
      const response = await this.client.findElement({
        description,
        accessibilityTree: await accessibilityTree.toStr(),
        app: await this.driver.app(),
      });
      if (response?.id == null) return;
      return this.driver.findElement(+response.id) as Promise<
        BaseDriver.ElementOf<TDriver>
      >;
    });
  }

  @span("alumni.area", spanAttrs)
  async area(description: string): Promise<Area<TDriver>> {
    this.driver.resetAccessibilityTree();
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const response = await this.client.findArea({
      description,
      accessibilityTree: await accessibilityTree.toStr(),
      app: await this.driver.app(),
    });
    const scopedTree = await accessibilityTree.scopeToArea(response.id);
    return new Area(
      response.id,
      response.explanation,
      scopedTree,
      this.driver,
      this.tools,
      this.client,
    );
  }

  @span("alumni.learn", spanAttrs)
  async learn(goal: string, actions: string[]): Promise<void> {
    return this.client.addExample({ goal, actions });
  }

  @span("alumni.clear_learn_examples", spanAttrs)
  async clearLearnExamples(): Promise<void> {
    return this.client.clearExamples();
  }

  @span("alumni.get_stats", spanAttrs)
  getStats(): Promise<LlmUsageStats> {
    return this.client.getStats();
  }
}

function spanAttrs(this: Alumni): Tracer.SpansAlumniAttrsBase {
  return {
    "alumni.flavor": "alumni",
  };
}
