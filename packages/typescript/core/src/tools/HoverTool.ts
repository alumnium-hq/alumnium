import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { BaseTool } from "./BaseTool.ts";
import { field, type FieldMetadata } from "./Field.ts";

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

  async invoke(driver: HoverTool.Driver): Promise<void> {
    await driver.hover(this.id);
  }
}

export namespace HoverTool {
  /** Driver capable of hovering over elements. */
  export interface Driver extends BaseDriver {
    hover(id: number): Promise<void>;
  }
}
