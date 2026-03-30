import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.js";
import { Client } from "../clients/Client.js";
import type { Data } from "../clients/typecasting.js";
import { BaseDriver, type Element } from "../drivers/index.js";
import { BaseTool, type ToolClass } from "../tools/BaseTool.js";
import { retry } from "../utils/retry.js";
import { type VisionOptions } from "./Alumni.js";
import { AssertionError } from "./errors/AssertionError.js";
import type { DoResult, DoStep } from "./result.js";

export class Area {
  public id: number;
  public description: string;
  private accessibilityTree: BaseAccessibilityTree;
  private driver: BaseDriver;
  private tools: Record<string, ToolClass>;
  private client: Client;

  constructor(
    id: number,
    description: string,
    accessibilityTree: BaseAccessibilityTree,
    driver: BaseDriver,
    tools: Record<string, ToolClass>,
    client: Client,
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
    const app = await this.driver.app();

    const { explanation, steps } = await this.client.planActions(
      goal,
      this.accessibilityTree.toStr(),
      app,
    );

    let finalExplanation = explanation;
    const executedSteps: DoStep[] = [];
    for (const step of steps) {
      const { explanation: actorExplanation, actions } =
        await this.client.executeAction(
          goal,
          step,
          this.accessibilityTree.toStr(),
          app,
        );

      // When planner is off, explanation is just the goal — replace with actor's reasoning.
      if (finalExplanation === goal) {
        finalExplanation = actorExplanation;
      }

      const calledTools: string[] = [];
      for (const toolCall of actions) {
        const calledTool = await BaseTool.executeToolCall(
          toolCall,
          this.tools,
          this.driver,
        );
        calledTools.push(calledTool);
      }

      executedSteps.push({ name: step, tools: calledTools });
    }

    return { explanation: finalExplanation, steps: executedSteps, changes: "" };
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
      await this.driver.app(),
      screenshot,
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
      await this.driver.app(),
      screenshot,
    );

    return value === null ? explanation : value;
  }

  @retry()
  async find(description: string): Promise<Element | undefined> {
    const response = await this.client.findElement(
      description,
      this.accessibilityTree.toStr(),
      await this.driver.app(),
    );
    if (response?.id == null) return;
    return this.driver.findElement(+response.id);
  }
}
