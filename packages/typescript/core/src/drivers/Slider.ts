import {
  setInputValueScriptSource,
  sliderScriptSource,
} from "./scripts/bundledScripts.ts";

interface Point {
  x: number;
  y: number;
}

interface PointerStep {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The next step to set an ARIA slider, as computed by scripts/slider.js. */
export type SliderStep =
  | ({ action: "down" | "move" } & PointerStep)
  | { action: "up" }
  | { action: "done"; value: number | null };

export type SliderScript = (
  element: unknown,
  value: number,
  reset: boolean,
) => SliderStep | null;

/**
 * How a driver performs slider steps. ARIA sliders only respond to real pointer
 * events, so these must not be emulated with scripts.
 */
export interface SliderActions {
  next(reset: boolean): Promise<SliderStep | null>;
  down(point: SliderPoint): Promise<void>;
  move(point: SliderPoint): Promise<void>;
  up(): Promise<void>;
}

/** Sets ARIA sliders by following the steps computed by scripts/slider.js. */
export class Slider {
  static readonly EXPRESSION = `(${sliderScriptSource})`;
  static readonly EXECUTE_SCRIPT = `return (${sliderScriptSource})(arguments[0], arguments[1], arguments[2]);`;
  static readonly SET_INPUT_VALUE_SCRIPT = `(${setInputValueScriptSource})(arguments[0], arguments[1]);`;
  static readonly MAX_STEPS = 100;

  /**
   * Performs steps until the slider reaches the value or gets as close as it can.
   * Returns false when the element is a native input, which callers set directly.
   */
  static async set(actions: SliderActions): Promise<boolean> {
    let pressed = false;
    try {
      for (let i = 0; i < Slider.MAX_STEPS; i++) {
        const step = await actions.next(i === 0);
        if (!step) return false;
        switch (step.action) {
          case "done":
            return true;
          case "down":
            pressed = true;
            await actions.down(new SliderPoint(step));
            break;
          case "move":
            await actions.move(new SliderPoint(step));
            break;
          case "up":
            pressed = false;
            await actions.up();
            break;
        }
      }
      return true;
    } finally {
      // Never leave the pointer pressed, e.g. when the slider got re-rendered.
      if (pressed) await actions.up().catch(() => {});
    }
  }
}

/** A pointer position over a slider, relative to the slider element. */
export class SliderPoint {
  private readonly step: PointerStep;

  constructor(step: PointerStep) {
    this.step = step;
  }

  offset(): Point {
    return { x: this.step.x, y: this.step.y };
  }

  centerOffset(): Point {
    return {
      x: Math.round(this.step.x - this.step.width / 2),
      y: Math.round(this.step.y - this.step.height / 2),
    };
  }
}
