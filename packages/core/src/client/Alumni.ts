import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { always } from "alwaysly";
import type { Page } from "playwright-core";
import { WebDriver } from "selenium-webdriver";
import type { Browser } from "webdriverio";
import { Client } from "../clients/Client.js";
import { HttpClient } from "../clients/HttpClient.js";
import { NativeClient } from "../clients/NativeClient.js";
import { Data } from "../clients/typecasting.js";
import {
  AppiumDriver,
  BaseDriver,
  Element,
  PlaywrightDriver,
  SeleniumDriver,
} from "../drivers/index.js";
import { Model } from "../Model.js";
import { UsageStats } from "../server/serverSchema.js";
import { BaseTool, ToolClass } from "../tools/BaseTool.js";
import { getLogger } from "../utils/logger.js";
import { retry } from "../utils/retry.js";
import { Area } from "./Area.js";
import { Cache } from "./Cache.js";
import { AssertionError } from "./errors/AssertionError.js";
import { DoResult, DoStep } from "./result.js";

const logger = getLogger(import.meta.url);
const changeAnalysis =
  (process.env.ALUMNIUM_CHANGE_ANALYSIS || "false").toLowerCase() === "true";
const PLANNER =
  (process.env.ALUMNIUM_PLANNER || "true").toLowerCase() === "true";
const excludedAttributes = new Set(
  (process.env.ALUMNIUM_EXCLUDE_ATTRIBUTES || "").split(",").filter(Boolean),
);

export interface AlumniOptions {
  url?: string;
  model?: Model;
  llm?: BaseChatModel;
  extraTools?: ToolClass[];
  planner?: boolean | undefined;
  changeAnalysis?: boolean;
  excludedAttributes?: Set<string>;
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
    this.url = options.url || "http://localhost:8013";
    this.model = options.model || Model.current;
    this.changeAnalysis = options.changeAnalysis ?? changeAnalysis;
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

    if (this.url) {
      logger.info(`Using HTTP client with server: ${this.url}`);
      this.client = new HttpClient(
        this.url,
        this.model,
        this.driver.platform,
        this.tools,
        planner,
        options.excludedAttributes ?? excludedAttributes,
      );
    } else {
      logger.info("Using native client");
      this.client = new NativeClient(
        this.model,
        this.driver.platform,
        this.tools,
        this.llm,
        planner,
        // TODO: Add  excludedAttributes to NativeClient
        // options.excludedAttributes ?? excludedAttributes,
      );
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
      screenshot,
      await this.driver.app(),
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
      screenshot,
      await this.driver.app(),
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

  async getStats(): Promise<UsageStats> {
    return await this.client.getStats();
  }
}
