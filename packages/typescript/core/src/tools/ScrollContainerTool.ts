import { BaseDriver } from "../drivers/BaseDriver.ts";
import { Driver } from "../drivers/Driver.ts";
import { BaseTool } from "./BaseTool.ts";
import { field, type FieldMetadata } from "./Field.ts";

export class ScrollContainerTool extends BaseTool {
  static description =
    "Scroll a native container or the screen one step to reveal offscreen content. Fetch the accessibility tree after scrolling to find newly visible controls. Directions describe the content to reveal: down reveals content below, up reveals content above.";
  static fields: FieldMetadata[] = [
    field({
      name: "id",
      type: "integer",
      description:
        "Container element identifier (ID). Omit to scroll the screen.",
      required: false,
    }),
    field({
      name: "direction",
      type: "string",
      description: "Direction of the content to reveal",
      enum: Driver.scrollDirections,
    }),
  ];

  id: number | undefined;
  direction: Driver.ScrollDirection;

  constructor(args: { id?: number; direction: Driver.ScrollDirection }) {
    super();
    this.id = args.id;
    this.direction = args.direction;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.scroll(this.id, this.direction);
  }
}
