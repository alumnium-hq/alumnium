import { BaseAccessibilityTree } from "./accessibility/BaseAccessibilityTree.js";
import { HttpClient } from "./clients/HttpClient.js";
import { Data } from "./clients/typecasting.js";
import { BaseDriver } from "./drivers/BaseDriver.js";
import { Element } from "./drivers/index.js";
import { BaseTool, ToolCall, ToolClass } from "./tools/BaseTool.js";

export interface AreaCheckOptions {
  vision?: boolean;
}

export interface AreaGetOptions {
  vision?: boolean;
}

export class Area {
  public id: number;
  public description: string;
  private accessibilityTree: BaseAccessibilityTree;
  private driver: BaseDriver;
  private tools: Record<string, ToolClass>;
  private client: HttpClient;

  constructor(
    id: number,
    description: string,
    accessibilityTree: BaseAccessibilityTree,
    driver: BaseDriver,
    tools: Record<string, ToolClass>,
    client: HttpClient
  ) {
    this.id = id;
    this.description = description;
    this.accessibilityTree = accessibilityTree;
    this.driver = driver;
    this.tools = tools;
    this.client = client;
  }

  async do(goal: string): Promise<void> {
    const steps = await this.client.planActions(
      goal,
      this.accessibilityTree.toStr()
    );

    for (const step of steps) {
      const actorResponse = await this.client.executeAction(
        goal,
        step,
        this.accessibilityTree.toStr()
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

  async check(
    statement: string,
    options: AreaCheckOptions = {}
  ): Promise<string> {
    const screenshot = options.vision
      ? await this.driver.screenshot()
      : undefined;
    const [explanation, value] = await this.client.retrieve(
      `Is the following true or false - ${statement}`,
      this.accessibilityTree.toStr(),
      await this.driver.title(),
      await this.driver.url(),
      screenshot
    );

    if (!value) {
      throw new Error(explanation);
    }

    return explanation;
  }

  async get(data: string, options: AreaGetOptions = {}): Promise<Data> {
    const screenshot = options.vision
      ? await this.driver.screenshot()
      : undefined;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const [_explanation, value] = await this.client.retrieve(
      data,
      this.accessibilityTree.toStr(),
      await this.driver.title(),
      await this.driver.url(),
      screenshot
    );

    return value;
  }

  async find(description: string): Promise<Element> {
    const response = await this.client.findElement(
      description,
      this.accessibilityTree.toStr()
    );

    return this.driver.findElement(response.id as number);
  }
}
