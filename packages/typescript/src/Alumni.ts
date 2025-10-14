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
import { Model } from "./Model.js";
import { BaseTool, ToolCall } from "./tools/BaseTool.js";
import { ClickTool } from "./tools/ClickTool.js";
import { DragAndDropTool } from "./tools/DragAndDropTool.js";
import { HoverTool } from "./tools/HoverTool.js";
import { PressKeyTool } from "./tools/PressKeyTool.js";
import { SelectTool } from "./tools/SelectTool.js";
import { TypeTool } from "./tools/TypeTool.js";
import { getLogger } from "./utils/logger.js";

const logger = getLogger(["Alumni"]);

export interface AlumniOptions {
  url?: string;
  model?: Model;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  extraTools?: (new (...args: any[]) => BaseTool)[];
}

export interface CheckOptions {
  vision?: boolean;
}

export interface GetOptions {
  vision?: boolean;
}

export class Alumni {
  public driver: BaseDriver;
  private client: HttpClient;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tools: Record<string, new (...args: any[]) => BaseTool>;
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

    // Initialize tools
    this.tools = {
      ClickTool,
      TypeTool,
      HoverTool,
      SelectTool,
      PressKeyTool,
      DragAndDropTool,
    };

    // Add extra tools if provided
    if (options.extraTools) {
      for (const tool of options.extraTools) {
        this.tools[tool.name] = tool;
      }
    }

    // Initialize HTTP client
    this.client = new HttpClient(this.url, this.driver.platform, this.tools);
    this.cache = new Cache(this.client);

    logger.info(`Using model: ${this.model.provider}/${this.model.name}`);
    logger.info(`Using HTTP client with server: ${this.url}`);
  }

  async quit(): Promise<void> {
    await this.client.quit();
    await this.driver.quit();
  }

  async do(goal: string): Promise<void> {
    const initialAccessibilityTree = await this.driver.getAccessibilityTree();
    const steps = await this.client.planActions(
      goal,
      initialAccessibilityTree.toStr()
    );

    for (let idx = 0; idx < steps.length; idx++) {
      const step = steps[idx];

      // Use initial tree for first step, fresh tree for subsequent steps
      const accessibilityTree =
        idx === 0
          ? initialAccessibilityTree
          : await this.driver.getAccessibilityTree();
      const actorResponse = await this.client.executeAction(
        goal,
        step,
        accessibilityTree.toStr()
      );

      // Execute tool calls
      for (const toolCall of actorResponse) {
        await BaseTool.executeToolCall(
          toolCall as ToolCall,
          this.tools,
          this.driver
        );
      }
    }
  }

  async check(statement: string, options: CheckOptions = {}): Promise<string> {
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
      throw new Error(explanation);
    }

    return explanation;
  }

  async get(data: string, options: GetOptions = {}): Promise<Data> {
    const screenshot = options.vision
      ? await this.driver.screenshot()
      : undefined;
    const accessibilityTree = await this.driver.getAccessibilityTree();
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_explanation, value] = await this.client.retrieve(
      data,
      accessibilityTree.toStr(),
      await this.driver.title(),
      await this.driver.url(),
      screenshot
    );

    return value;
  }

  async find(description: string): Promise<Element> {
    const accessibilityTree = await this.driver.getAccessibilityTree();
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response = await this.client.findElement(
      description,
      accessibilityTree.toStr()
    );
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
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
