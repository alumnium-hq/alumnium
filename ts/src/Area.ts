import { HttpClient, Data } from './clients/HttpClient';
import { BaseDriver } from './drivers/BaseDriver';
import { BaseTool, ToolCall } from './tools/BaseTool';
import { BaseAccessibilityTree } from './accessibility/BaseAccessibilityTree';

export class Area {
  private id: number;
  private description: string;
  private driver: BaseDriver;
  private accessibilityTree: BaseAccessibilityTree;
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
    this.accessibilityTree = driver.accessibilityTree.getArea(id);
  }

  async do(goal: string): Promise<void> {
    const steps = await this.client.planActions(goal, this.accessibilityTree.toXml());

    for (const step of steps) {
      const actorResponse = await this.client.executeAction(goal, step, this.accessibilityTree.toXml());

      for (const toolCall of actorResponse) {
        BaseTool.executeToolCall(toolCall as ToolCall, this.tools, this.accessibilityTree, this.driver);
      }
    }
  }

  async check(statement: string, vision: boolean = false): Promise<string> {
    const screenshot = vision ? await this.driver.screenshot() : undefined;
    const [explanation, value] = await this.client.retrieve(
      `Is the following true or false - ${statement}`,
      this.accessibilityTree.toXml(),
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
      this.accessibilityTree.toXml(),
      await this.driver.title(),
      await this.driver.url(),
      screenshot
    );

    return value;
  }

  async find(description: string): Promise<any> {
    const response = await this.client.findElement(description, this.accessibilityTree.toXml());
    const id = this.accessibilityTree.elementById(response.id).id;
    return this.driver.findElement(id);
  }
}
