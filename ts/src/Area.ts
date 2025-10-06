import { HttpClient, Data } from './clients/HttpClient.js';
import { BaseDriver } from './drivers/BaseDriver.js';
import { BaseTool, ToolCall } from './tools/BaseTool.js';

export class Area {
  public id: number;
  public description: string;
  private driver: BaseDriver;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tools: Record<string, new (...args: any[]) => BaseTool>;
  private client: HttpClient;

  constructor(
    id: number,
    description: string,
    driver: BaseDriver,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
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
    // Get full tree and filter it to this area
    const fullTree = await this.driver.getAccessibilityTree();
    const areaTree = fullTree.filterToArea(this.id);
    const steps = await this.client.planActions(goal, areaTree);

    for (let idx = 0; idx < steps.length; idx++) {
      const step = steps[idx];

      // Get fresh tree and filter to area
      const currentFullTree = await this.driver.getAccessibilityTree();
      const currentAreaTree = currentFullTree.filterToArea(this.id);
      const actorResponse = await this.client.executeAction(goal, step, currentAreaTree);

      // Execute tool calls - use client for element lookup
      for (const toolCall of actorResponse) {
        await BaseTool.executeToolCall(toolCall as ToolCall, this.tools, this.client, this.driver);
      }
    }
  }

  async check(statement: string, vision: boolean = false): Promise<string> {
    const screenshot = vision ? await this.driver.screenshot() : undefined;
    const fullTree = await this.driver.getAccessibilityTree();
    const areaTree = fullTree.filterToArea(this.id);
    const [explanation, value] = await this.client.retrieve(
      `Is the following true or false - ${statement}`,
      areaTree,
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
    const fullTree = await this.driver.getAccessibilityTree();
    const areaTree = fullTree.filterToArea(this.id);
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_explanation, value] = await this.client.retrieve(
      data,
      areaTree,
      await this.driver.title(),
      await this.driver.url(),
      screenshot
    );

    return value;
  }

  async find(description: string): Promise<unknown> {
    const fullTree = await this.driver.getAccessibilityTree();
    const areaTree = fullTree.filterToArea(this.id);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    const response = await this.client.findElement(description, areaTree);
    // eslint-disable-next-line @typescript-eslint/no-unsafe-member-access
    const backendId = this.client.elementById(response.id as number).id;
    return this.driver.findElement(backendId);
  }
}
