import type { ElementRef, UsageStats } from "../server/serverSchema.js";
import type { ToolCall } from "../tools/BaseTool.js";
import type { Data } from "./typecasting.js";

export interface Client {
  quit(): Promise<void>;

  planActions(
    goal: string,
    accessibilityTree: string,
  ): Promise<Client.PlanActionsResult>;

  addExample(goal: string, actions: string[]): Promise<void>;

  clearExamples(): Promise<void>;

  executeAction(
    goal: string,
    step: string,
    accessibilityTree: string,
  ): Promise<Client.ExecuteActionResult>;

  retrieve(
    statement: string,
    accessibilityTree: string,
    title: string,
    url: string,
    screenshot?: string,
  ): Promise<[string, Data]>;

  findArea(
    description: string,
    accessibilityTree: string,
  ): Promise<Client.FindAreaResult>;

  findElement(
    description: string,
    accessibilityTree: string,
  ): Promise<Client.FindElementResult | undefined>;

  saveCache(): Promise<void>;

  discardCache(): Promise<void>;

  getStats(): Promise<UsageStats>;

  analyzeChanges(
    beforeAccessibilityTree: string,
    beforeUrl: string,
    afterAccessibilityTree: string,
    afterUrl: string,
  ): Promise<string>;
}

export namespace Client {
  export interface Props {}

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
