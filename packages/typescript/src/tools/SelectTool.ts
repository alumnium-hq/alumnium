import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";
import { field, FieldMetadata } from "./Field.js";

export class SelectTool extends BaseTool {
  static description =
    "Selects an option in a dropdown. Only use this tool if the dropdown is a combobox.";
  static fields: FieldMetadata[] = [
    field({
      name: "id",
      type: "integer",
      description: "Element identifier (ID)",
    }),
    field({ name: "option", type: "string", description: "Option to select" }),
  ];

  id: number;
  option: string;

  constructor(args: { id: number; option: string }) {
    super();
    this.id = args.id;
    this.option = args.option;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.select(this.id, this.option);
  }
}
