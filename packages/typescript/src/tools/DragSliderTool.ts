import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";
import { field, FieldMetadata } from "./Field.js";

export class DragSliderTool extends BaseTool {
  static description =
    "Set slider to a desired value by clicking at the calculated position based on the slider's width and step.";
  static fields: FieldMetadata[] = [
    field({
      name: "id",
      type: "integer",
      description: "Identifier (ID) of the slider element",
    }),
    field({
      name: "value",
      type: "number",
      description: "Desired value to set the slider to",
    }),
  ];

  id: number;
  value: number;

  constructor(args: { id: number; value: number }) {
    super();
    this.id = args.id;
    this.value = args.value;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.dragSlider(this.id, this.value);
  }
}
