import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { BaseTool } from "./BaseTool.ts";
import { field, type FieldMetadata } from "./Field.ts";

const DIRECTIONS = ["up", "down", "left", "right"] as const;

export class PanInDirectionTool extends BaseTool {
  static description =
    "Pan a map or other draggable canvas by dragging it like a user. Use it for any request to pan, move or drag a map, also by a distance in pixels: each call moves the view by half of the map's visible height (or width). The direction is where the view moves, which is opposite to where the map is dragged: to pan left or see what is to the left, use left; to drag the map to the right, also use left. Don't use ScrollInDirectionTool or ExecuteJavascriptTool on maps: the mouse wheel zooms them, and scripts can't drag them. To zoom, use ZoomTool.";
  static fields: FieldMetadata[] = [
    field({
      name: "id",
      type: "integer",
      description: "Identifier (ID) of the map, or of any element inside it",
    }),
    field({
      name: "direction",
      type: "string",
      description:
        "Direction to move the view. It is the opposite of the direction the map is dragged in: to drag the map right, use left.",
      enum: DIRECTIONS,
    }),
  ];

  /** Pointer moves between press and release, so the drag is not taken for a click. */
  static readonly STEPS = 10;
  /** Rest before release, so the drag is not taken for a fling. */
  static readonly HOLD_DELAY = 200;
  /** Maps keep animating and loading tiles after release. */
  static readonly SETTLE_DELAY = 300;

  id: number;
  direction: PanInDirectionTool.Direction;

  constructor(args: { id: number; direction: PanInDirectionTool.Direction }) {
    super();
    this.id = args.id;
    this.direction = args.direction;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.panInDirection(this.id, this.direction);
  }
}

export namespace PanInDirectionTool {
  export type Direction = (typeof DIRECTIONS)[number];
}
