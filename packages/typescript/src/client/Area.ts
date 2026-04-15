import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { Client } from "../clients/Client.ts";
import type { Data } from "../clients/typecasting.ts";
import { BaseDriver, type Element } from "../drivers/index.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import type { Tracer } from "../telemetry/Tracer.ts";
import { BaseTool, type ToolClass } from "../tools/BaseTool.ts";
import { retry } from "../utils/retry.ts";
import { type Alumni } from "./Alumni.ts";
import { AssertionError } from "./errors/AssertionError.ts";
import type { DoResult, DoStep } from "./result.ts";

const { tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

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

  @span("alumni.do", spanAttrs)
  async do(goal: string): Promise<DoResult> {
    return retry(async () => {
      const app = await this.driver.app();

      const { explanation, steps } = await this.client.planActions({
        goal,
        accessibilityTree: this.accessibilityTree.toStr(),
        app,
      });

      let finalExplanation = explanation;
      const executedSteps: DoStep[] = [];
      for (const step of steps) {
        const { explanation: actorExplanation, actions } =
          await this.client.executeAction({
            goal,
            step,
            accessibilityTree: this.accessibilityTree.toStr(),
            app,
          });

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

      return {
        explanation: finalExplanation,
        steps: executedSteps,
        changes: "",
      };
    });
  }

  @span("alumni.check", (_, options) => ({
    "alumni.flavor": "area",
    "alumni.method.args.vision": !!options?.vision,
  }))
  async check(
    statement: string,
    options: Alumni.VisionOptions = {},
  ): Promise<string> {
    return retry(async () => {
      const screenshot = options.vision
        ? await this.driver.screenshot()
        : undefined;
      const [explanation, value] = await this.client.retrieve({
        statement: `Is the following true or false - ${statement}`,
        accessibilityTree: this.accessibilityTree.toStr(),
        title: await this.driver.title(),
        url: await this.driver.url(),
        app: await this.driver.app(),
        screenshot,
      });

      if (!value) {
        throw new AssertionError(explanation);
      }

      return explanation;
    });
  }

  @span("alumni.get", (_, options) => ({
    "alumni.flavor": "area",
    "alumni.method.args.vision": !!options?.vision,
  }))
  async get(data: string, options: Alumni.VisionOptions = {}): Promise<Data> {
    return retry(async () => {
      const screenshot = options.vision
        ? await this.driver.screenshot()
        : undefined;
      const [explanation, value] = await this.client.retrieve({
        statement: data,
        accessibilityTree: this.accessibilityTree.toStr(),
        title: await this.driver.title(),
        url: await this.driver.url(),
        app: await this.driver.app(),
        screenshot,
      });

      return value === null ? explanation : value;
    });
  }

  @span("alumni.find", spanAttrs)
  async find(description: string): Promise<Element | undefined> {
    return retry(async () => {
      const response = await this.client.findElement({
        description,
        accessibilityTree: this.accessibilityTree.toStr(),
        app: await this.driver.app(),
      });
      if (response?.id == null) return;
      return this.driver.findElement(+response.id);
    });
  }
}

function spanAttrs(this: Area): Tracer.SpansAlumniAttrsBase {
  return {
    "alumni.flavor": "area",
  };
}
