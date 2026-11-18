import z from "zod";
import { AppId } from "../AppId.ts";
import type { Driver } from "../drivers/Driver.ts";
import { LlmUsageStats } from "../llm/llmSchema.ts";
import { Model } from "../Model.ts";
import type { Params } from "../Params.ts";
import type { ElementRef } from "../server/serverSchema.ts";
import type { ToolCall, ToolClass } from "../tools/BaseTool.ts";
import type { Data } from "./typecasting.ts";

export namespace Client {
  export interface Props {
    platform: Driver.Platform;
    driver: Driver.Kind;
    tools: Record<string, ToolClass>;
    planner: boolean | undefined;
    excludeAttributes: string[] | undefined;
    knowledge?: string | undefined;
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
    params?: Params.Values | undefined;
    cache?: boolean | undefined;
  }

  export interface PlanActionsProps {
    goal: string;
    accessibilityTree: string;
    app: AppId;
    screenshot?: string | undefined;
    params?: Params.Values | undefined;
    cache?: boolean | undefined;
  }

  export interface AddExampleProps {
    goal: string;
    actions: string[];
    app?: AppId | undefined;
    layer?: LessonLayer | undefined;
  }

  export interface AddHintProps {
    kind: HintKind;
    instruction: string;
    hint: string;
    app?: AppId | undefined;
    layer?: LessonLayer | undefined;
  }

  export interface ForgetLessonProps {
    kind: LessonKind;
    instruction: string;
    layer?: LessonLayer | undefined;
  }

  export interface ClearLayerProps {
    layer?: LessonLayer | undefined;
  }

  /** Kinds of instructions hints are learned for, named after `Alumni` methods. */
  export type HintKind = "get" | "check" | "find" | "area";

  /** Kinds of lessons, named after `Alumni` methods. */
  export type LessonKind = "do" | HintKind;

  /**
   * Layer a lesson persists in: shared by all products, the product on every
   * platform (the default), or the product on one platform.
   */
  export type LessonLayer = "shared" | "product" | "web" | "ios" | "android";

  export interface ExecuteActionProps {
    goal: string;
    step: string;
    accessibilityTree: string;
    app: AppId;
    screenshot?: string | undefined;
    params?: Params.Values | undefined;
    cache?: boolean | undefined;
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
    cache?: boolean | undefined;
  }

  export interface AnalyzeChangesProps {
    beforeAccessibilityTree: string;
    beforeUrl: string;
    afterAccessibilityTree: string;
    afterUrl: string;
    app: AppId;
    cache?: boolean | undefined;
  }
}

export abstract class Client {
  static Health = z.object({
    status: z.literal("healthy"),
  });

  protected platform: Driver.Platform;
  protected driver: Driver.Kind;
  protected tools: Record<string, ToolClass>;
  protected planner: boolean;
  protected excludeAttributes: string[] | undefined;
  protected knowledge: string | undefined;

  constructor(props: Client.Props) {
    this.platform = props.platform;
    this.driver = props.driver;
    this.tools = props.tools;
    this.planner = props.planner ?? true;
    this.excludeAttributes = props.excludeAttributes;
    this.knowledge = props.knowledge;
  }

  abstract getHealth(): Promise<Client.Health>;

  abstract getModel(): Promise<Model>;

  abstract quit(): Promise<void>;

  abstract planActions(
    props: Client.PlanActionsProps,
  ): Promise<Client.PlanActionsResult>;

  abstract addExample(props: Client.AddExampleProps): Promise<void>;

  abstract addHint(props: Client.AddHintProps): Promise<void>;

  abstract forgetLesson(props: Client.ForgetLessonProps): Promise<boolean>;

  abstract clearLayer(props: Client.ClearLayerProps): Promise<void>;

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
