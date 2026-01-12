import { PlaywrightDriver } from "../drivers/PlaywrightDriver.js";
import { SeleniumDriver } from "../drivers/SeleniumDriver.js";
import { BaseTool } from "./BaseTool.js";
import { field, FieldMetadata } from "./Field.js";

export class HoverTool extends BaseTool {
  static description = "Hover over an element.";
  static fields: FieldMetadata[] = [
    field({
      name: "id",
      type: "integer",
      description: "Element identifier (ID)",
    }),
  ];

  id: number;

  constructor(args: { id: number }) {
    super();
    this.id = args.id;
  }

  async invoke(driver: PlaywrightDriver | SeleniumDriver): Promise<void> {
    await driver.hover(this.id);
  }
}
