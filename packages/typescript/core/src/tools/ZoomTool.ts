import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { BaseTool } from "./BaseTool.ts";
import { field, type FieldMetadata } from "./Field.ts";

const DIRECTIONS = ["in", "out"] as const;

export class ZoomTool extends BaseTool {
  static description =
    "Zoom a map or other zoomable canvas in or out around its center, like a pinch. If the map has its own zoom in/out buttons, click them instead.";
  static fields: FieldMetadata[] = [
    field({
      name: "id",
      type: "integer",
      description: "Identifier (ID) of the map, or of any element inside it",
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

  /** Distance of each wheel move. Wheeling up zooms in. */
  static wheelDelta(direction: ZoomTool.Direction): number {
    return direction === "in" ? -ZoomTool.WHEEL_DELTA : ZoomTool.WHEEL_DELTA;
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
