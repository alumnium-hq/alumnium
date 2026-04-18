import z from "zod";
import { AppId } from "../AppId.ts";
import type { Driver } from "../drivers/Driver.ts";
import { LlmUsageStats } from "../llm/llmSchema.ts";
import { Model } from "../Model.ts";
import type { ElementRef } from "../server/serverSchema.ts";
import type { ToolCall, ToolClass } from "../tools/BaseTool.ts";
import type { Data } from "./typecasting.ts";

export namespace Client {
  export interface Props {
    platform: Driver.Platform;
    tools: Record<string, ToolClass>;
    planner: boolean | undefined;
    excludeAttributes: string[] | undefined;
  }

  export interface PlanActionsResult {
    explanation: string;
    steps: string[];
  }

  export interface ExecuteActionResult {
    explanation: string;
    actions: ToolCall[];
  }

  export interface FindAreaResult {
    id: number;
    explanation: string;
  }

  export type FindElementResult = ElementRef;

  export type Health = z.infer<typeof Client.Health>;
}

export abstract class Client {
  static Health = z.object({
    status: z.literal("healthy"),
  });

  protected platform: Driver.Platform;
  protected tools: Record<string, ToolClass>;
  protected planner: boolean;
  protected excludeAttributes: string[] | undefined;

  constructor(props: Client.Props) {
    this.platform = props.platform;
    this.tools = props.tools;
    this.planner = props.planner ?? true;
    this.excludeAttributes = props.excludeAttributes;
  }

  abstract getHealth(): Promise<Client.Health>;

  abstract getModel(): Promise<Model>;

  abstract quit(): Promise<void>;

  abstract planActions(
    goal: string,
    accessibilityTree: string,
    app: AppId,
  ): Promise<Client.PlanActionsResult>;

  abstract addExample(goal: string, actions: string[]): Promise<void>;

  abstract clearExamples(): Promise<void>;

  abstract executeAction(
    goal: string,
    step: string,
    accessibilityTree: string,
    app: AppId,
  ): Promise<Client.ExecuteActionResult>;

  abstract retrieve(
    statement: string,
    accessibilityTree: string,
    title: string,
    url: string,
    app: AppId,
    screenshot?: string,
  ): Promise<[string, Data]>;

  abstract findArea(
    description: string,
    accessibilityTree: string,
    app: AppId,
  ): Promise<Client.FindAreaResult>;

  abstract findElement(
    description: string,
    accessibilityTree: string,
    app: AppId,
  ): Promise<Client.FindElementResult | undefined>;

  abstract saveCache(): Promise<void>;

  abstract discardCache(): Promise<void>;

  abstract getStats(): Promise<LlmUsageStats>;

  abstract analyzeChanges(
    beforeAccessibilityTree: string,
    beforeUrl: string,
    afterAccessibilityTree: string,
    afterUrl: string,
    app: AppId,
  ): Promise<string>;
}
