import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";
import { field, FieldMetadata } from "./Field.js";

export class DragTool extends BaseTool {
  static description = "Drag element by a pixel offset.";
  static fields: FieldMetadata[] = [
    field({
      name: "id",
      type: "integer",
      description: "Identifier (ID) of element to drag",
    }),
    field({
      name: "offsetX",
      type: "integer",
      description: "Horizontal pixel offset to drag by",
      paramName: "offset_x",
    }),
    field({
      name: "offsetY",
      type: "integer",
      description: "Vertical pixel offset to drag by",
      paramName: "offset_y",
    }),
  ];

  id: number;
  offsetX: number;
  offsetY: number;

  constructor(args: { id: number; offset_x: number; offset_y: number }) {
    super();
    this.id = args.id;
    this.offsetX = args.offset_x;
    this.offsetY = args.offset_y;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.drag(this.id, this.offsetX, this.offsetY);
  }
}
