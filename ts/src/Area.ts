import { HttpClient, Data } from './clients/HttpClient.js';
import { BaseDriver } from './drivers/BaseDriver.js';
import { BaseTool, ToolCall } from './tools/BaseTool.js';
import { BaseAccessibilityTree } from './accessibility/BaseAccessibilityTree.js';

export class Area {
  public id: number;
  public description: string;
  private driver: BaseDriver;
  private accessibilityTree: BaseAccessibilityTree | null = null;
  private accessibilityTreePromise: Promise<BaseAccessibilityTree> | null = null;
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

  private async ensureAccessibilityTree(): Promise<BaseAccessibilityTree> {
    if (this.accessibilityTree) {
      return this.accessibilityTree;
    }

    if (!this.accessibilityTreePromise) {
      this.accessibilityTreePromise = this.driver.getAccessibilityTree().then(tree => {
        this.accessibilityTree = tree.getArea(this.id);
        return this.accessibilityTree;
      });
    }

    return this.accessibilityTreePromise;
  }

  async do(goal: string): Promise<void> {
    const accessibilityTree = await this.ensureAccessibilityTree();
    const steps = await this.client.planActions(goal, accessibilityTree.toXml());

    for (const step of steps) {
      const actorResponse = await this.client.executeAction(goal, step, accessibilityTree.toXml());

      for (const toolCall of actorResponse) {
        BaseTool.executeToolCall(toolCall as ToolCall, this.tools, accessibilityTree, this.driver);
      }
    }
  }

  async check(statement: string, vision: boolean = false): Promise<string> {
    const accessibilityTree = await this.ensureAccessibilityTree();
    const screenshot = vision ? await this.driver.screenshot() : undefined;
    const [explanation, value] = await this.client.retrieve(
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
    const accessibilityTree = await this.ensureAccessibilityTree();
    const screenshot = vision ? await this.driver.screenshot() : undefined;
    const [_, value] = await this.client.retrieve(
      data,
      accessibilityTree.toXml(),
      await this.driver.title(),
      await this.driver.url(),
      screenshot
    );

    return value;
  }

  async find(description: string): Promise<any> {
    const accessibilityTree = await this.ensureAccessibilityTree();
    const response = await this.client.findElement(description, accessibilityTree.toXml());
    const id = accessibilityTree.elementById(response.id).id;
    return this.driver.findElement(id);
  }
}
