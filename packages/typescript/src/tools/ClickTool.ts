import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";
import { field, FieldMetadata } from "./Field.js";
import { SelectTool } from "./SelectTool.js";

export class ClickTool extends BaseTool {
  static description = `Click an element. Avoid using this tool for combobox dropdowns; use ${SelectTool.name} instead.`;
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
