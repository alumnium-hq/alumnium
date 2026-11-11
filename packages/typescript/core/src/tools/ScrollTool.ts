import { BaseDriver } from "../drivers/BaseDriver.ts";
import { BaseTool } from "./BaseTool.ts";
import { field, type FieldMetadata } from "./Field.ts";

export class ScrollTool extends BaseTool {
  static description =
    "Scroll the page so an element is centered on screen. To scroll a list, panel or page up or down, use ScrollInDirectionTool instead.";
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

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.scrollTo(this.id);
  }
}
