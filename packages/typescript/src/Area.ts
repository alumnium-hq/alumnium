import { BaseAccessibilityTree } from "./accessibility/BaseAccessibilityTree.js";
import { VisionOptions } from "./Alumni.js";
import { HttpClient } from "./clients/HttpClient.js";
import { Data } from "./clients/typecasting.js";
import { BaseDriver } from "./drivers/BaseDriver.js";
import { Element } from "./drivers/index.js";
import { AssertionError } from "./errors/AssertionError.js";
import { DoResult, DoStep } from "./result.js";
import { BaseTool, ToolCall, ToolClass } from "./tools/BaseTool.js";
import { retry } from "./utils/retry.js";

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

  @retry()
  async do(goal: string): Promise<DoResult> {
    const { explanation, steps } = await this.client.planActions(
      goal,
      this.accessibilityTree.toStr()
    );

    let finalExplanation = explanation;
    const executedSteps: DoStep[] = [];
    for (const step of steps) {
      const { explanation: actorExplanation, actions } =
        await this.client.executeAction(
          goal,
          step,
          this.accessibilityTree.toStr()
        );

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
    const [explanation, value] = await this.client.retrieve(
      `Is the following true or false - ${statement}`,
      this.accessibilityTree.toStr(),
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
    const [explanation, value] = await this.client.retrieve(
      data,
      this.accessibilityTree.toStr(),
      await this.driver.title(),
      await this.driver.url(),
      screenshot
    );

    return value === null ? explanation : value;
  }

  @retry()
  async find(description: string): Promise<Element> {
    const response = await this.client.findElement(
      description,
      this.accessibilityTree.toStr()
    );

    return this.driver.findElement(response.id as number);
  }
}
