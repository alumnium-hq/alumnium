import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { always } from "alwaysly";
import type { Page } from "playwright-core";
import { WebDriver } from "selenium-webdriver";
import type { Browser } from "webdriverio";
import { Client } from "../clients/Client.js";
import { HttpClient } from "../clients/HttpClient.js";
import { NativeClient } from "../clients/NativeClient.js";
import type { Data } from "../clients/typecasting.js";
import {
  AppiumDriver,
  BaseDriver,
  type Element,
  PlaywrightDriver,
  SeleniumDriver,
} from "../drivers/index.js";
import { LlmUsageStats } from "../llm/llmSchema.js";
import { Model } from "../Model.js";
import { BaseTool, type ToolClass } from "../tools/BaseTool.js";
import { getLogger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";
import { Area } from "./Area.js";
import { Cache } from "./Cache.js";
import { AssertionError } from "./errors/AssertionError.js";
import type { DoResult, DoStep } from "./result.js";

const logger = getLogger(import.meta.url);

const CHANGE_ANALYSIS =
  (process.env.ALUMNIUM_CHANGE_ANALYSIS || "false").toLowerCase() === "true";
const PLANNER =
  (process.env.ALUMNIUM_PLANNER || "true").toLowerCase() === "true";
const EXCLUDE_ATTRIBUTES = (process.env.ALUMNIUM_EXCLUDE_ATTRIBUTES || "")
  .split(",")
  .filter(Boolean);

export interface AlumniOptions {
  url?: string | undefined;
  model?: Model | undefined;
  llm?: BaseChatModel | undefined;
  extraTools?: ToolClass[];
  planner?: boolean | undefined;
  changeAnalysis?: boolean | undefined;
  excludeAttributes?: string[] | undefined;
}

export interface VisionOptions {
  vision?: boolean;
}

export class Alumni {
  public driver: BaseDriver;
  client: Client;

  private tools: Record<string, ToolClass> = {};
  public cache: Cache;
  private url: string | undefined;
  model: Model;
  private changeAnalysis: boolean;
  private llm: BaseChatModel | undefined;

  constructor(driver: WebDriver | Page | Browser, options: AlumniOptions = {}) {
    this.url = options.url;
    this.model = options.model || Model.current;
    this.changeAnalysis = options.changeAnalysis ?? CHANGE_ANALYSIS;
    this.llm = options.llm;

    // Wrap driver or use directly if already wrapped
    if (driver instanceof WebDriver) {
      this.driver = new SeleniumDriver(driver);
    } else if ((driver as Page).context) {
      this.driver = new PlaywrightDriver(driver as Page);
    } else if (
      (driver as Browser).capabilities &&
      (driver as Browser).getPageSource
    ) {
      // WebdriverIO Browser (Appium)
      this.driver = new AppiumDriver(driver as Browser);
    } else {
      throw new Error(`Unsupported driver type '${typeof driver}'`);
    }

    for (const tool of new Set([
      ...this.driver.supportedTools,
      ...(options.extraTools || []),
    ])) {
      this.tools[tool.name] = tool;
    }

    const planner = options.planner ?? PLANNER;

    const clientProps: Client.Props = {
      model: this.model,
      platform: this.driver.platform,
      tools: this.tools,
      planner,
      excludeAttributes: options.excludeAttributes ?? EXCLUDE_ATTRIBUTES,
    };

    if (this.url) {
      logger.info(`Using HTTP client with server: ${this.url}`);
      this.client = new HttpClient({
        baseUrl: this.url,
        ...clientProps,
      });
    } else {
      logger.info("Using native client");
      this.client = new NativeClient({
        llm: this.llm,
        ...clientProps,
      });
    }

    this.cache = new Cache(this.client);

    logger.info(`Using model: ${this.model.provider}/${this.model.name}`);
  }

  async quit(): Promise<void> {
    await this.client.quit();
    await this.driver.quit();
  }

  @retry()
  async do(goal: string): Promise<DoResult> {
    const app = await this.driver.app();

    const initialAccessibilityTree = await this.driver.getAccessibilityTree();
    const beforeTree = this.changeAnalysis
      ? initialAccessibilityTree.toStr()
      : null;
    const beforeUrl = this.changeAnalysis ? await this.driver.url() : null;
    const { explanation, steps } = await this.client.planActions(
      goal,
      initialAccessibilityTree.toStr(),
      app,
    );

    let finalExplanation = explanation;
    const executedSteps: DoStep[] = [];
    for (let idx = 0; idx < steps.length; idx++) {
      const step = steps[idx];
      always(step);

      // Use initial tree for first step, fresh tree for subsequent steps
      const accessibilityTree =
        idx === 0
          ? initialAccessibilityTree
          : await this.driver.getAccessibilityTree();
      const { explanation: actorExplanation, actions } =
        await this.client.executeAction(
          goal,
          step,
          accessibilityTree.toStr(),
          app,
        );

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
      changes = await this.client.analyzeChanges(
        beforeTree!,
        beforeUrl!,
        (await this.driver.getAccessibilityTree()).toStr(),
        await this.driver.url(),
        app,
      );
    }

    return { explanation: finalExplanation, steps: executedSteps, changes };
  }

  @retry()
  async check(statement: string, options: VisionOptions = {}): Promise<string> {
    const screenshot = options.vision
      ? await this.driver.screenshot()
      : undefined;
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const [explanation, value] = await this.client.retrieve(
      `Is the following true or false - ${statement}`,
      accessibilityTree.toStr(),
      await this.driver.title(),
      await this.driver.url(),
      await this.driver.app(),
      screenshot,
    );

    if (!value) {
      throw new AssertionError(explanation);
    }

    return explanation;
  }

  @retry()
  async get(data: string, options: VisionOptions = {}): Promise<Data> {
    const screenshot = options.vision
      ? await this.driver.screenshot()
      : undefined;
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const [explanation, value] = await this.client.retrieve(
      data,
      accessibilityTree.toStr(),
      await this.driver.title(),
      await this.driver.url(),
      await this.driver.app(),
      screenshot,
    );

    return value === null ? explanation : value;
  }

  @retry()
  async find(description: string): Promise<Element | undefined> {
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const response = await this.client.findElement(
      description,
      accessibilityTree.toStr(),
      await this.driver.app(),
    );
    if (response?.id == null) return;
    return this.driver.findElement(+response.id);
  }

  async area(description: string): Promise<Area> {
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const response = await this.client.findArea(
      description,
      accessibilityTree.toStr(),
      await this.driver.app(),
    );
    const scopedTree = accessibilityTree.scopeToArea(response.id);
    return new Area(
      response.id,
      response.explanation,
      scopedTree,
      this.driver,
      this.tools,
      this.client,
    );
  }

  async learn(goal: string, actions: string[]): Promise<void> {
    await this.client.addExample(goal, actions);
  }

  async clearLearnExamples(): Promise<void> {
    await this.client.clearExamples();
  }

  getStats(): Promise<LlmUsageStats> {
    return this.client.getStats();
  }
}
