import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { scrollAreaScriptSource } from "../drivers/scripts/bundledScripts.ts";
import { BaseTool } from "./BaseTool.ts";
import { field, type FieldMetadata } from "./Field.ts";

const DIRECTIONS = ["up", "down", "left", "right"] as const;

export class ScrollInDirectionTool extends BaseTool {
  static description =
    "Scroll a scrollable area (page, list, panel, chat thread) in a direction by most of its visible height (or width), like a mouse wheel. Use it to reveal content above or below the visible part of the area. To bring a specific element into view, use ScrollTool instead.";
  static fields: FieldMetadata[] = [
    field({
      name: "id",
      type: "integer",
      description:
        "Identifier (ID) of the scrollable area, or of any element inside it",
    }),
    field({
      name: "direction",
      type: "string",
      description: "Direction to scroll the content.",
      enum: DIRECTIONS,
    }),
  ];

  /** `scripts/scrollArea.js` as a function expression and as a WebDriver script. */
  static readonly SCROLL_AREA_EXPRESSION = `(${scrollAreaScriptSource})`;
  static readonly SCROLL_AREA_SCRIPT = `return (${scrollAreaScriptSource})(arguments[0]);`;
  /** Wheel input does not wait for scrolling to finish. */
  static readonly SETTLE_DELAY = 300;

  /** Scrolls 80% of the area's visible size, so consecutive scrolls overlap. */
  static wheelDelta(
    direction: ScrollInDirectionTool.Direction,
    area: ScrollInDirectionTool.Area,
  ): { deltaX: number; deltaY: number } {
    const x = Math.round(area.width * 0.8);
    const y = Math.round(area.height * 0.8);
    return {
      up: { deltaX: 0, deltaY: -y },
      down: { deltaX: 0, deltaY: y },
      left: { deltaX: -x, deltaY: 0 },
      right: { deltaX: x, deltaY: 0 },
    }[direction];
  }

  id: number;
  direction: ScrollInDirectionTool.Direction;

  constructor(args: {
    id: number;
    direction: ScrollInDirectionTool.Direction;
  }) {
    super();
    this.id = args.id;
    this.direction = args.direction;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.scrollInDirection(this.id, this.direction);
  }
}

export namespace ScrollInDirectionTool {
  export type Direction = (typeof DIRECTIONS)[number];

  /** Result of `scripts/scrollArea.js`. */
  export interface Area {
    offsetX: number;
    offsetY: number;
    viewportX: number;
    viewportY: number;
    width: number;
    height: number;
  }
}
