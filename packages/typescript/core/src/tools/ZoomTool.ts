import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { BaseTool } from "./BaseTool.ts";
import { field, type FieldMetadata } from "./Field.ts";

const DIRECTIONS = ["in", "out"] as const;

export class ZoomTool extends BaseTool {
  static description =
    "Zoom a map or other zoomable canvas in or out around its center, like a pinch. Use it for any request to zoom by a gesture, a pinch, the mouse wheel or scrolling on the map: don't use ScrollInDirectionTool to zoom. If the map has its own zoom in/out buttons, click them instead, unless asked not to.";
  static fields: FieldMetadata[] = [
    field({
      name: "id",
      type: "integer",
      description:
        "Identifier (ID) of the map itself, not of a marker or control inside it",
    }),
    field({
      name: "direction",
      type: "string",
      description: "Zoom in to see more detail, or out to see a larger area.",
      enum: DIRECTIONS,
    }),
  ];

  /**
   * A zoom is a burst of small wheel moves with Control held, like a trackpad
   * pinch. Map libraries count the moves, their distance, or both: this burst
   * is one zoom level on Google Maps and Leaflet, and less on others.
   */
  static readonly WHEEL_STEPS = 5;
  static readonly WHEEL_DELTA = 40;
  /** Maps keep animating and loading tiles after zooming. */
  static readonly SETTLE_DELAY = 500;

  /** Page script that records the distance of the next wheel move it gets. */
  static readonly WHEEL_PROBE =
    '(() => { window.__alumniumWheel = undefined; addEventListener("wheel", (event) => { window.__alumniumWheel = event.deltaY; }, { capture: true, once: true, passive: true }); })()';
  /** Page expression for the distance recorded by the probe. */
  static readonly WHEEL_RECEIVED = "window.__alumniumWheel";

  /** Distance of each wheel move. Wheeling up zooms in. */
  static wheelDelta(direction: ZoomTool.Direction): number {
    return direction === "in" ? -ZoomTool.WHEEL_DELTA : ZoomTool.WHEEL_DELTA;
  }

  /**
   * Wheel moves that follow the first one, given the distance the page
   * received for it. A headed Chromium driven by Playwright scales wheel
   * distances by the screen's pixel ratio, so the rest of the burst is
   * corrected to make a zoom the same everywhere.
   */
  static remainingWheelDeltas(
    direction: ZoomTool.Direction,
    received?: number,
  ): number[] {
    const delta = ZoomTool.wheelDelta(direction);
    const scale = received && received / delta > 0 ? received / delta : 1;
    const rest = ZoomTool.WHEEL_STEPS - 1;
    return Array<number>(rest).fill(
      (delta * ZoomTool.WHEEL_STEPS - delta * scale) / rest / scale,
    );
  }

  id: number;
  direction: ZoomTool.Direction;

  constructor(args: { id: number; direction: ZoomTool.Direction }) {
    super();
    this.id = args.id;
    this.direction = args.direction;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.zoom(this.id, this.direction);
  }
}

export namespace ZoomTool {
  export type Direction = (typeof DIRECTIONS)[number];
}
