import { HttpClient, Data } from './clients/HttpClient.js';
import { BaseDriver } from './drivers/BaseDriver.js';
import { BaseTool, ToolCall } from './tools/BaseTool.js';

export class Area {
  public id: number;
  public description: string;
  private driver: BaseDriver;
  private tools: Record<string, new (...args: any[]) => BaseTool>;
  private client: HttpClient;

  constructor(
    id: number,
    description: string,
    driver: BaseDriver,
    tools: Record<string, new (...args: any[]) => BaseTool>,
    client: HttpClient
  ) {
    this.id = id;
    this.description = description;
    this.driver = driver;
    this.tools = tools;
    this.client = client;
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
}
