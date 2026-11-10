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

  /** Fraction of the scroll area scrolled by one call, leaving some overlap. */
  static areaFraction = 0.8;

  /**
   * Scripts running `scripts/scrollArea.js`, which returns the visible scroll
   * area of an element as a `ScrollInDirectionTool.Area`, or `null` when it is
   * off screen. `SCROLL_AREA_EXPRESSION` evaluates to the function itself;
   * `SCROLL_AREA_SCRIPT` calls it with the first WebDriver script argument.
   */
  static readonly SCROLL_AREA_EXPRESSION = `(${scrollAreaScriptSource})`;
  static readonly SCROLL_AREA_SCRIPT = `return (${scrollAreaScriptSource})(arguments[0]);`;

  /** Wheel delta in pixels for a direction, based on the scroll area size. */
  static wheelDelta(
    direction: ScrollInDirectionTool.Direction,
    area: { width: number; height: number },
  ): { deltaX: number; deltaY: number } {
    const x = Math.round(area.width * ScrollInDirectionTool.areaFraction);
    const y = Math.round(area.height * ScrollInDirectionTool.areaFraction);
    switch (direction) {
      case "up":
        return { deltaX: 0, deltaY: -y };
      case "down":
        return { deltaX: 0, deltaY: y };
      case "left":
        return { deltaX: -x, deltaY: 0 };
      case "right":
        return { deltaX: x, deltaY: 0 };
    }
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

  async invoke(driver: ScrollInDirectionTool.Driver): Promise<void> {
    await driver.scrollInDirection(this.id, this.direction);
  }
}

export namespace ScrollInDirectionTool {
  export type Direction = (typeof DIRECTIONS)[number];

  /** Visible scroll area: its size and center relative to the element. */
  export interface Area {
    /** Visible center relative to the element's top-left corner. */
    offsetX: number;
    offsetY: number;
    /** Visible center in top-level viewport coordinates, across frames. */
    viewportX: number;
    viewportY: number;
    width: number;
    height: number;
  }

  /** Driver capable of scrolling an area with the mouse wheel. */
  export interface Driver extends BaseDriver {
    scrollInDirection(id: number, direction: Direction): Promise<void>;
  }
}
