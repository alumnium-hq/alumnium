import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";
import { field, FieldMetadata } from "./Field.js";

export class DragAndDropTool extends BaseTool {
  static description =
    "Drag one element onto another and drop it. Don't combine with HoverTool.";
  static fields: FieldMetadata[] = [
    field({
      name: "fromId",
      type: "integer",
      description: "Identifier (ID) of element to drag",
      paramName: "from_id",
    }),
    field({
      name: "toId",
      type: "integer",
      description: "Identifier (ID) of element to drop onto",
      paramName: "to_id",
    }),
  ];

  fromId: number;
  toId: number;

  constructor(args: { from_id: number; to_id: number }) {
    super();
    this.fromId = args.from_id;
    this.toId = args.to_id;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.dragAndDrop(this.fromId, this.toId);
  }
}
