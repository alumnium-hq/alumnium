import { WebDriver } from 'selenium-webdriver';
import { SeleniumDriver } from './drivers/SeleniumDriver';
import { BaseDriver } from './drivers/BaseDriver';
import { HttpClient, Data } from './clients/HttpClient';
import { Cache } from './Cache';
import { Area } from './Area';
import { BaseTool, ToolCall } from './tools/BaseTool';
import { ClickTool } from './tools/ClickTool';
import { TypeTool } from './tools/TypeTool';
import { HoverTool } from './tools/HoverTool';
import { SelectTool } from './tools/SelectTool';
import { PressKeyTool } from './tools/PressKeyTool';
import { DragAndDropTool } from './tools/DragAndDropTool';

export interface AlumniOptions {
  provider?: string;
  modelName?: string;
  url?: string;
}

export class Alumni {
  public driver: BaseDriver;
  private client: HttpClient;
  private tools: Record<string, new (...args: any[]) => BaseTool>;
  public cache: Cache;

  private constructor(driver: BaseDriver, client: HttpClient, tools: Record<string, new (...args: any[]) => BaseTool>) {
    this.driver = driver;
    this.client = client;
    this.tools = tools;
    this.cache = new Cache(this.client);
  }

  static async create(driver: WebDriver, options: AlumniOptions = {}): Promise<Alumni> {
    const provider = options.provider || 'openai';
    const modelName = options.modelName || 'gpt-4o';
    const url = options.url || 'http://localhost:8013';

    // Wrap driver
    let wrappedDriver: BaseDriver;
    if (driver instanceof WebDriver) {
      wrappedDriver = new SeleniumDriver(driver);
    } else {
      throw new Error('Unsupported driver type');
    }

    // Initialize tools
    const tools = {
      ClickTool,
      TypeTool,
      HoverTool,
      SelectTool,
      PressKeyTool,
      DragAndDropTool,
    };

    // Create HTTP client
    const client = await HttpClient.create(url, provider, modelName, tools);

    console.log(`Using model: ${provider}/${modelName}`);
    console.log(`Using HTTP client with server: ${url}`);

    return new Alumni(wrappedDriver, client, tools);
  }

  async quit(): Promise<void> {
    await this.client.quit();
    this.driver.quit();
  }

  async do(goal: string): Promise<void> {
    const initialAccessibilityTree = this.driver.accessibilityTree;
    const steps = await this.client.planActions(goal, initialAccessibilityTree.toXml());

    for (let idx = 0; idx < steps.length; idx++) {
      const step = steps[idx];

      // Use initial tree for first step, fresh tree for subsequent steps
      const accessibilityTree = idx === 0 ? initialAccessibilityTree : this.driver.accessibilityTree;
      const actorResponse = await this.client.executeAction(goal, step, accessibilityTree.toXml());

      // Execute tool calls
      for (const toolCall of actorResponse) {
        BaseTool.executeToolCall(toolCall as ToolCall, this.tools, accessibilityTree, this.driver);
      }
    }
  }

  async check(statement: string, vision: boolean = false): Promise<string> {
    const screenshot = vision ? await this.driver.screenshot() : undefined;
    const [explanation, value] = await this.client.retrieve(
      `Is the following true or false - ${statement}`,
      this.driver.accessibilityTree.toXml(),
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
    const [_, value] = await this.client.retrieve(
      data,
      this.driver.accessibilityTree.toXml(),
      await this.driver.title(),
      await this.driver.url(),
      screenshot
    );

    return value;
  }

  async find(description: string): Promise<any> {
    const accessibilityTree = this.driver.accessibilityTree;
    const response = await this.client.findElement(description, accessibilityTree.toXml());
    const id = accessibilityTree.elementById(response.id).id;
    return this.driver.findElement(id);
  }

  async area(description: string): Promise<Area> {
    const response = await this.client.findArea(description, this.driver.accessibilityTree.toXml());
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
