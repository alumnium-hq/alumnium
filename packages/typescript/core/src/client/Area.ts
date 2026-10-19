import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { Client } from "../clients/Client.ts";
import type { Data } from "../clients/typecasting.ts";
import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { NavigationBlockedError } from "../NavigationPolicy.ts";
import { Telemetry } from "../telemetry/Telemetry.ts";
import { Tracer } from "../telemetry/Tracer.ts";
import { BaseTool, type ToolClass } from "../tools/BaseTool.ts";
import { retry } from "../utils/retry.ts";
import type { Alumni } from "./Alumni.ts";
import { AssertionError } from "./errors/AssertionError.ts";
import type { DoResult, DoStep } from "./result.ts";

const { tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export class Area<TDriver extends BaseDriver = BaseDriver> {
  public id: number;
  public description: string;
  private accessibilityTree: BaseAccessibilityTree;
  private driver: TDriver;
  private tools: Record<string, ToolClass>;
  private client: Client;

  constructor(
    id: number,
    description: string,
    accessibilityTree: BaseAccessibilityTree,
    driver: TDriver,
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

  @span("alumni.do", (_, options) => ({
    "alumni.flavor": "area",
    "alumni.method.args.params": options?.params,
    "alumni.method.args.vision": !!options?.vision,
    "alumni.method.args.cache": options?.cache ?? true,
  }))
  async do(goal: string, options: Alumni.DoOptions = {}): Promise<DoResult> {
    return retry(
      { doRetry: (error) => !(error instanceof NavigationBlockedError) },
      async () => {
        const app = await this.driver.app();
        this.driver.setAccessibilityTree(this.accessibilityTree);

        const { explanation, steps } = await this.client.planActions({
          goal,
          params: options.params,
          accessibilityTree: await this.accessibilityTree.toStr(),
          app,
          screenshot: options.vision
            ? await this.driver.screenshot()
            : undefined,
          cache: options.cache,
        });

        let finalExplanation = explanation;
        const executedSteps: DoStep[] = [];
        for (const step of steps) {
          const screenshot = options.vision
            ? await this.driver.screenshot()
            : undefined;
          const { explanation: actorExplanation, actions } =
            await this.client.executeAction({
              goal,
              step,
              accessibilityTree: await this.accessibilityTree.toStr(),
              app,
              screenshot,
              params: options.params,
              cache: options.cache,
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
      },
    );
  }

  @span("alumni.check", (_, options) => ({
    "alumni.flavor": "area",
    "alumni.method.args.params": options?.params,
    "alumni.method.args.vision": !!options?.vision,
    "alumni.method.args.cache": options?.cache ?? true,
  }))
  async check(
    statement: string,
    options: Alumni.CheckOptions = {},
  ): Promise<string> {
    return retry(async () => {
      const screenshot = options.vision
        ? await this.driver.screenshot()
        : undefined;
      const [explanation, value] = await this.client.retrieve({
        statement: `Is the following true or false - ${statement}`,
        params: options.params,
        accessibilityTree: await this.accessibilityTree.toStr(),
        title: await this.driver.title(),
        url: await this.driver.url(),
        app: await this.driver.app(),
        screenshot,
        cache: options.cache,
      });

      if (!value) {
        throw new AssertionError(explanation);
      }

      return explanation;
    });
  }

  @span("alumni.get", (_, options) => ({
    "alumni.flavor": "area",
    "alumni.method.args.params": options?.params,
    "alumni.method.args.vision": !!options?.vision,
    "alumni.method.args.cache": options?.cache ?? true,
  }))
  async get(data: string, options: Alumni.GetOptions = {}): Promise<Data> {
    return retry(async () => {
      const screenshot = options.vision
        ? await this.driver.screenshot()
        : undefined;
      const [explanation, value] = await this.client.retrieve({
        statement: data,
        params: options.params,
        accessibilityTree: await this.accessibilityTree.toStr(),
        title: await this.driver.title(),
        url: await this.driver.url(),
        app: await this.driver.app(),
        screenshot,
        cache: options.cache,
      });

      return value === null ? explanation : value;
    });
  }

  @span("alumni.find", spanAttrs)
  async find(
    description: string,
  ): Promise<BaseDriver.ElementOf<TDriver> | undefined> {
    return retry(async () => {
      this.driver.setAccessibilityTree(this.accessibilityTree);
      const response = await this.client.findElement({
        description,
        accessibilityTree: await this.accessibilityTree.toStr(),
        app: await this.driver.app(),
      });
      if (response?.id == null) return;
      return this.driver.findElement(+response.id) as Promise<
        BaseDriver.ElementOf<TDriver>
      >;
    });
  }
}

function spanAttrs(this: Area): Tracer.SpansAlumniAttrsBase {
  return {
    "alumni.flavor": "area",
  };
}
