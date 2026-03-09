import { AppId } from "../AppId.js";
import type { Cache } from "../client/Cache.js";
import { LlmUsageStats } from "../llm/llmSchema.js";
import type { Model } from "../Model.js";
import type { ElementRef, Platform } from "../server/serverSchema.js";
import type { ToolCall, ToolClass } from "../tools/BaseTool.js";
import type { Data } from "./typecasting.js";

export namespace Client {
  export interface Props {
    model: Model;
    platform: Platform;
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
}

export abstract class Client {
  protected model: Model;
  protected platform: Platform;
  protected tools: Record<string, ToolClass>;
  protected planner: boolean;
  protected excludeAttributes: string[] | undefined;

  constructor(props: Client.Props) {
    this.model = props.model;
    this.platform = props.platform;
    this.tools = props.tools;
    this.planner = props.planner ?? true;
    this.excludeAttributes = props.excludeAttributes;
  }

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

  abstract clearCache(props?: Cache.ClearProps | undefined): Promise<void>;

  abstract getStats(): Promise<LlmUsageStats>;

  abstract analyzeChanges(
    beforeAccessibilityTree: string,
    beforeUrl: string,
    afterAccessibilityTree: string,
    afterUrl: string,
    app: AppId,
  ): Promise<string>;
}
