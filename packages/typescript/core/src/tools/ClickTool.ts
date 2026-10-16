import { BaseDriver } from "../drivers/BaseDriver.ts";
import { BaseTool } from "./BaseTool.ts";
import { field, type FieldMetadata } from "./Field.ts";

export class ClickTool extends BaseTool {
  static description = `Click an element. If the target element is a dropdown and is already expanded - you don't need to click it. NEVER use ClickTool to upload files - use UploadTool instead.`;
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
    await driver.click(this.id);
  }
}
