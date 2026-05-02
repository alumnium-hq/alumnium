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

  export interface RetrieveProps {
    statement: string;
    accessibilityTree: string;
    title: string;
    url: string;
    app: AppId;
    screenshot?: string | undefined;
  }

  export interface PlanActionsProps {
    goal: string;
    accessibilityTree: string;
    app: AppId;
  }

  export interface AddExampleProps {
    goal: string;
    actions: string[];
  }

  export interface ExecuteActionProps {
    goal: string;
    step: string;
    accessibilityTree: string;
    app: AppId;
  }

  export interface FindAreaProps {
    description: string;
    accessibilityTree: string;
    app: AppId;
  }

  export interface FindElementProps {
    description: string;
    accessibilityTree: string;
    app: AppId;
  }

  export interface AnalyzeChangesProps {
    beforeAccessibilityTree: string;
    beforeUrl: string;
    afterAccessibilityTree: string;
    afterUrl: string;
    app: AppId;
  }
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
    props: Client.PlanActionsProps,
  ): Promise<Client.PlanActionsResult>;

  abstract addExample(props: Client.AddExampleProps): Promise<void>;

  abstract clearExamples(): Promise<void>;

  abstract executeAction(
    props: Client.ExecuteActionProps,
  ): Promise<Client.ExecuteActionResult>;

  abstract retrieve(props: Client.RetrieveProps): Promise<[string, Data]>;

  abstract findArea(
    props: Client.FindAreaProps,
  ): Promise<Client.FindAreaResult>;

  abstract findElement(
    props: Client.FindElementProps,
  ): Promise<Client.FindElementResult | undefined>;

  abstract saveCache(): Promise<void>;

  abstract discardCache(): Promise<void>;

  abstract getStats(): Promise<LlmUsageStats>;

  abstract analyzeChanges(props: Client.AnalyzeChangesProps): Promise<string>;
}
