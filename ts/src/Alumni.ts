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
import { Model } from './Model';

export interface AlumniOptions {
  url?: string;
  model?: Model;
}

export class Alumni {
  public driver: BaseDriver;
  private client: HttpClient | null = null;
  private clientPromise: Promise<HttpClient> | null = null;
  private tools: Record<string, new (...args: any[]) => BaseTool>;
  public cache: Cache | null = null;
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

    console.log(`Using model: ${this.model.provider}/${this.model.name}`);
    console.log(`Using HTTP client with server: ${this.url}`);
  }

  private async ensureClient(): Promise<HttpClient> {
    if (this.client) {
      return this.client;
    }

    if (!this.clientPromise) {
      this.clientPromise = HttpClient.create(
        this.url,
        this.tools
      ).then(client => {
        this.client = client;
        this.cache = new Cache(client);
        return client;
      });
    }

    return this.clientPromise;
  }

  async quit(): Promise<void> {
    if (this.client) {
      await this.client.quit();
    }
    this.driver.quit();
  }

  async do(goal: string): Promise<void> {
    const client = await this.ensureClient();
    const initialAccessibilityTree = await this.driver.getAccessibilityTree();
    const steps = await client.planActions(goal, initialAccessibilityTree.toXml());

    for (let idx = 0; idx < steps.length; idx++) {
      const step = steps[idx];

      // Use initial tree for first step, fresh tree for subsequent steps
      const accessibilityTree = idx === 0 ? initialAccessibilityTree : await this.driver.getAccessibilityTree();
      const actorResponse = await client.executeAction(goal, step, accessibilityTree.toXml());

      // Execute tool calls
      for (const toolCall of actorResponse) {
        await BaseTool.executeToolCall(toolCall as ToolCall, this.tools, accessibilityTree, this.driver);
      }
    }
  }

  async check(statement: string, vision: boolean = false): Promise<string> {
    const client = await this.ensureClient();
    const screenshot = vision ? await this.driver.screenshot() : undefined;
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const [explanation, value] = await client.retrieve(
      `Is the following true or false - ${statement}`,
      accessibilityTree.toXml(),
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
    const client = await this.ensureClient();
    const screenshot = vision ? await this.driver.screenshot() : undefined;
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const [_, value] = await client.retrieve(
      data,
      accessibilityTree.toXml(),
      await this.driver.title(),
      await this.driver.url(),
      screenshot
    );

    return value;
  }

  async find(description: string): Promise<any> {
    const client = await this.ensureClient();
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const response = await client.findElement(description, accessibilityTree.toXml());
    const id = accessibilityTree.elementById(response.id).id;
    return this.driver.findElement(id);
  }

  async area(description: string): Promise<Area> {
    const client = await this.ensureClient();
    const accessibilityTree = await this.driver.getAccessibilityTree();
    const response = await client.findArea(description, accessibilityTree.toXml());
    return new Area(response.id, response.explanation, this.driver, this.tools, client);
  }

  async learn(goal: string, actions: string[]): Promise<void> {
    const client = await this.ensureClient();
    await client.addExample(goal, actions);
  }

  async clearLearnExamples(): Promise<void> {
    const client = await this.ensureClient();
    await client.clearExamples();
  }

  async getStats(): Promise<Record<string, Record<string, number>>> {
    const client = await this.ensureClient();
    return await client.getStats();
  }
}
