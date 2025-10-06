import { WebDriver } from 'selenium-webdriver';
import { SeleniumDriver } from './drivers/SeleniumDriver.js';
import { BaseDriver } from './drivers/BaseDriver.js';
import { HttpClient, Data } from './clients/HttpClient.js';
import { Cache } from './Cache.js';
import { Area } from './Area.js';
import { BaseTool, ToolCall } from './tools/BaseTool.js';
import { ClickTool } from './tools/ClickTool.js';
import { TypeTool } from './tools/TypeTool.js';
import { HoverTool } from './tools/HoverTool.js';
import { SelectTool } from './tools/SelectTool.js';
import { PressKeyTool } from './tools/PressKeyTool.js';
import { DragAndDropTool } from './tools/DragAndDropTool.js';
import { Model } from './Model.js';

export interface AlumniOptions {
  url?: string;
  model?: Model;
  extraTools?: (new (...args: any[]) => BaseTool)[];
}

export class Alumni {
  public driver: BaseDriver;
  private client: HttpClient;
  private tools: Record<string, new (...args: any[]) => BaseTool>;
  public cache: Cache;
  private url: string;
  private model: Model;

  constructor(driver: WebDriver, options: AlumniOptions = {}) {
    this.url = options.url || 'http://localhost:8013';
    this.model = options.model || Model.current;

    // Wrap driver
    if (driver instanceof WebDriver) {
      this.driver = new SeleniumDriver(driver);
    } else {
      throw new Error('Unsupported driver type');
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
    this.client = new HttpClient(this.url, this.tools);
    this.cache = new Cache(this.client);

    console.log(`Using model: ${this.model.provider}/${this.model.name}`);
    console.log(`Using HTTP client with server: ${this.url}`);
  }

  async quit(): Promise<void> {
    await this.client.quit();
    this.driver.quit();
  }

  async do(goal: string): Promise<void> {
    const initialAccessibilityTree = await this.driver.getAccessibilityTree();
    const steps = await this.client.planActions(goal, initialAccessibilityTree);

    for (let idx = 0; idx < steps.length; idx++) {
      const step = steps[idx];

      // Use initial tree for first step, fresh tree for subsequent steps
      const accessibilityTree = idx === 0 ? initialAccessibilityTree : await this.driver.getAccessibilityTree();
      const actorResponse = await this.client.executeAction(goal, step, accessibilityTree);

      // Execute tool calls - use client for element lookup
      for (const toolCall of actorResponse) {
        await BaseTool.executeToolCall(toolCall as ToolCall, this.tools, this.client, this.driver);
      }
    }
  }

  async check(statement: string, vision: boolean = false): Promise<string> {
    const screenshot = vision ? await this.driver.screenshot() : undefined;
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const [explanation, value] = await this.client.retrieve(
      `Is the following true or false - ${statement}`,
      accessibilityTree,
      await this.driver.title(),
      await this.driver.url(),
      screenshot
    );

    if (!value) {
      throw new Error(explanation);
    }

    return explanation;
  }

  async get(data: string, vision: boolean = false): Promise<Data> {
    const screenshot = vision ? await this.driver.screenshot() : undefined;
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const [_, value] = await this.client.retrieve(
      data,
      accessibilityTree,
      await this.driver.title(),
      await this.driver.url(),
      screenshot
    );

    return value;
  }

  async find(description: string): Promise<any> {
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const response = await this.client.findElement(description, accessibilityTree);
    const backendId = this.client.elementById(response.id).id;
    return this.driver.findElement(backendId);
  }

  async area(description: string): Promise<Area> {
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const response = await this.client.findArea(description, accessibilityTree);
    return new Area(response.id, response.explanation, this.driver, this.tools, this.client);
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
