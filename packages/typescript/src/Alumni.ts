import { Page } from "playwright";
import { WebDriver } from "selenium-webdriver";
import type { Browser } from "webdriverio";
import { Area } from "./Area.js";
import { Cache } from "./Cache.js";
import { HttpClient } from "./clients/HttpClient.js";
import { Data } from "./clients/typecasting.js";
import { AppiumDriver } from "./drivers/AppiumDriver.js";
import { BaseDriver } from "./drivers/BaseDriver.js";
import { Element } from "./drivers/index.js";
import { PlaywrightDriver } from "./drivers/PlaywrightDriver.js";
import { SeleniumDriver } from "./drivers/SeleniumDriver.js";
import { AssertionError } from "./errors/AssertionError.js";
import { Model } from "./Model.js";
import { DoResult, DoStep } from "./result.js";
import { BaseTool, ToolCall, ToolClass } from "./tools/BaseTool.js";
import { getLogger } from "./utils/logger.js";
import { retry } from "./utils/retry.js";

const logger = getLogger(["Alumni"]);
const planner =
  (process.env.ALUMNIUM_PLANNER || "true").toLowerCase() === "true";

export interface AlumniOptions {
  url?: string;
  model?: Model;
  extraTools?: ToolClass[];
  planner?: boolean;
}

export interface VisionOptions {
  vision?: boolean;
}

export class Alumni {
  public driver: BaseDriver;
  private client: HttpClient;

  private tools: Record<string, ToolClass> = {};
  public cache: Cache;
  private url: string;
  private model: Model;

  constructor(driver: WebDriver | Page | Browser, options: AlumniOptions = {}) {
    this.url = options.url || "http://localhost:8013";
    this.model = options.model || Model.current;

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

    // Initialize HTTP client
    this.client = new HttpClient(
      this.url,
      this.model,
      this.driver.platform,
      this.tools,
      options.planner ?? planner
    );
    this.cache = new Cache(this.client);

    logger.info(`Using model: ${this.model.provider}/${this.model.name}`);
    logger.info(`Using HTTP client with server: ${this.url}`);
  }

  async quit(): Promise<void> {
    await this.client.quit();
    await this.driver.quit();
  }

  @retry()
  async do(goal: string): Promise<DoResult> {
    const initialAccessibilityTree = await this.driver.getAccessibilityTree();
    const { explanation, steps } = await this.client.planActions(
      goal,
      initialAccessibilityTree.toStr()
    );

    let finalExplanation = explanation;
    const executedSteps: DoStep[] = [];
    for (let idx = 0; idx < steps.length; idx++) {
      const step = steps[idx];

      // Use initial tree for first step, fresh tree for subsequent steps
      const accessibilityTree =
        idx === 0
          ? initialAccessibilityTree
          : await this.driver.getAccessibilityTree();
      const { explanation: actorExplanation, actions } =
        await this.client.executeAction(goal, step, accessibilityTree.toStr());

      // When planner is off, explanation is just the goal — replace with actor's reasoning.
      if (finalExplanation === goal) {
        // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
        finalExplanation = actorExplanation;
      }

      const calledTools: string[] = [];
      for (const toolCall of actions) {
        const calledTool = await BaseTool.executeToolCall(
          toolCall as ToolCall,
          this.tools,
          this.driver
        );
        calledTools.push(calledTool);
      }

      executedSteps.push({ name: step, tools: calledTools });
    }

    return { explanation: finalExplanation, steps: executedSteps };
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
      screenshot
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
      screenshot
    );

    return value === null ? explanation : value;
  }

  @retry()
  async find(description: string): Promise<Element> {
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const response = await this.client.findElement(
      description,
      accessibilityTree.toStr()
    );
    return this.driver.findElement(response.id as number);
  }

  async area(description: string): Promise<Area> {
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const response = await this.client.findArea(
      description,
      accessibilityTree.toStr()
    );
    const scopedTree = accessibilityTree.scopeToArea(response.id);
    return new Area(
      response.id,
      response.explanation,
      scopedTree,
      this.driver,
      this.tools,
      this.client
    );
  }

  async learn(goal: string, actions: string[]): Promise<void> {
    await this.client.addExample(goal, actions);
  }

  async clearLearnExamples(): Promise<void> {
    await this.client.clearExamples();
  }

  async getStats(): Promise<Record<string, Record<string, number>>> {
    return await this.client.getStats();
  }
}
