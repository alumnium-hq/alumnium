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

  async do(goal: string): Promise<DoResult> {
    return tracer.span("alumni.do", this.#spanAttrs(), () =>
      retry(async () => {
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

        return {
          explanation: finalExplanation,
          steps: executedSteps,
          changes: "",
        };
      }),
    );
  }

  async check(
    statement: string,
    options: Alumni.VisionOptions = {},
  ): Promise<string> {
    return tracer.span(
      "alumni.check",
      {
        ...this.#spanAttrs(),
        "alumni.method.args.vision": !!options.vision,
      },
      () =>
        retry(async () => {
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
        }),
    );
  }

  async get(data: string, options: Alumni.VisionOptions = {}): Promise<Data> {
    return tracer.span(
      "alumni.get",
      {
        ...this.#spanAttrs(),
        "alumni.method.args.vision": !!options.vision,
      },
      () =>
        retry(async () => {
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
        }),
    );
  }

  async find(description: string): Promise<Element | undefined> {
    return tracer.span("alumni.find", this.#spanAttrs(), () =>
      retry(async () => {
        const response = await this.client.findElement(
          description,
          this.accessibilityTree.toStr(),
          await this.driver.app(),
        );
        if (response?.id == null) return;
        return this.driver.findElement(+response.id);
      }),
    );
  }

  #spanAttrs(): Tracer.SpansAlumniAttrsBase {
    return {
      "alumni.flavor": "area",
    };
  }
}
