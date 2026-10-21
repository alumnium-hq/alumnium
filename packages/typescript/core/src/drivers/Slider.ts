import { sliderScriptSource } from "./scripts/bundledScripts.ts";

interface Point {
  x: number;
  y: number;
}

interface SliderGeometry {
  from: Point;
  to: Point;
  width: number;
  height: number;
}

/** Where to drag an ARIA slider to reach a value, as computed by scripts/slider.js. */
export class Slider {
  static readonly SCRIPT = new Function(`return (${sliderScriptSource})`)() as (
    element: unknown,
    value: number,
  ) => SliderGeometry | null;
  static readonly EXECUTE_SCRIPT = `return (${sliderScriptSource})(arguments[0], arguments[1]);`;

  private readonly geometry: SliderGeometry;

  private constructor(geometry: SliderGeometry) {
    this.geometry = geometry;
  }

  static parse(result: SliderGeometry | null): Slider | null {
    return result ? new Slider(result) : null;
  }

  startOffset(): Point {
    return this.geometry.from;
  }

  endOffset(): Point {
    return this.geometry.to;
  }

  startCenterOffset(): Point {
    return this.centerOffset(this.geometry.from);
  }

  endCenterOffset(): Point {
    return this.centerOffset(this.geometry.to);
  }

  private centerOffset({ x, y }: Point): Point {
    return {
      x: Math.round(x - this.geometry.width / 2),
      y: Math.round(y - this.geometry.height / 2),
    };
  }
}
