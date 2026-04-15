import { z } from "zod";
import { PlaySelector } from "./PlaySelector.ts";

export namespace PlayStep {
  export type Click = z.infer<typeof PlayStep.Click>;

  export type DragSlider = z.infer<typeof PlayStep.DragSlider>;

  export type DragAndDrop = z.infer<typeof PlayStep.DragAndDrop>;

  export type PressKey = z.infer<typeof PlayStep.PressKey>;

  export type Back = z.infer<typeof PlayStep.Back>;

  export type Type = z.infer<typeof PlayStep.Type>;

  export type Visit = z.infer<typeof PlayStep.Visit>;

  export type ScrollTo = z.infer<typeof PlayStep.ScrollTo>;

  export type ExecuteScript = z.infer<typeof PlayStep.ExecuteScript>;

  export type SwitchToNextTab = z.infer<typeof PlayStep.SwitchToNextTab>;

  export type SwitchToPreviousTab = z.infer<typeof PlayStep.SwitchToPreviousTab>;

  export type Wait = z.infer<typeof PlayStep.Wait>;

  export type WaitForSelector = z.infer<typeof PlayStep.WaitForSelector>;

  export type Schema = z.infer<typeof PlayStep.Schema>;
}

export abstract class PlayStep {
  static Click = z.object({
    kind: z.literal("click"),
    selector: PlaySelector
  });

  static DragSlider = z.object({
    kind: z.literal("drag-slider"),
    selector: PlaySelector,
    value: z.number(),
  });

  static DragAndDrop = z.object({
    kind: z.literal("drag-and-drop"),
    from: PlaySelector,
    to: PlaySelector,
  });

  static PressKey = z.object({
    kind: z.literal("press-key"),
    key: z.string(),
  });

  static Back = z.object({
    kind: z.literal("back"),
  });

  static Type = z.object({
    kind: z.literal("type"),
    selector: PlaySelector,
    text: z.string(),
  });

  static Visit = z.object({
    kind: z.literal("visit"),
    url: z.string(),
  });

  static ScrollTo = z.object({
    kind: z.literal("scroll-to"),
    selector: PlaySelector,
  });

  static ExecuteScript = z.object({
    kind: z.literal("execute-script"),
    script: z.string(),
  });

  static SwitchToNextTab = z.object({
    kind: z.literal("switch-to-next-tab"),
  });

  static SwitchToPreviousTab = z.object({
    kind: z.literal("switch-to-previous-tab"),
  });

  static Wait = z.object({
    kind: z.literal("wait"),
    seconds: z.number(),
  });

  static WaitForSelector = z.object({
    kind: z.literal("wait-for-selector"),
    selector: PlaySelector,
    timeout: z.number().optional(),
  });

  static Schema = z.union([
    this.Click,
    this.DragSlider,
    this.DragAndDrop,
    this.PressKey,
    this.Back,
    this.Type,
    this.Visit,
    this.ScrollTo,
    this.ExecuteScript,
    this.SwitchToNextTab,
    this.SwitchToPreviousTab,
    this.Wait,
    this.WaitForSelector,
  ]);
}
