import { BaseDriver } from "../drivers/BaseDriver.ts";
import { Driver } from "../drivers/Driver.ts";
import { BaseTool } from "./BaseTool.ts";
import { field, type FieldMetadata } from "./Field.ts";

export class ScrollTool extends BaseTool {
  static description =
    "Without a direction, scroll the specified element into view. With a direction, scroll the specified container one step, or the screen when no element is supplied. Provide an element or a direction. Directional scrolling is supported by Maestro and Xcode; directions describe the content to reveal (down reveals content below). Use a fresh accessibility tree to locate newly revealed controls.";
  static fields: FieldMetadata[] = [
    field({
      name: "id",
      type: "integer",
      description:
        "Destination element ID without direction; container ID with direction. Omit to scroll the screen.",
      required: false,
    }),
    field({
      name: "direction",
      type: "string",
      description:
        "Direction of the content to reveal. Omit to scroll the destination element into view. Maestro and Xcode only.",
      enum: Driver.scrollDirections,
      required: false,
    }),
  ];

  id: number | undefined;
  direction: Driver.ScrollDirection | undefined;

  constructor(args: { id?: number; direction?: Driver.ScrollDirection }) {
    super();
    this.id = args.id;
    this.direction = args.direction;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    if (this.direction !== undefined) {
      await driver.scroll(this.id, this.direction);
    } else if (this.id !== undefined) {
      await driver.scrollTo(this.id);
    } else {
      throw new Error("ScrollTool requires an element ID or a direction");
    }
  }
}
