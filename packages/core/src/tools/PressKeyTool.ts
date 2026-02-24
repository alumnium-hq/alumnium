import { BaseDriver } from "../drivers/BaseDriver.js";
import { Key } from "../drivers/keys.js";
import { BaseTool } from "./BaseTool.js";
import { field, FieldMetadata } from "./Field.js";

export class PressKeyTool extends BaseTool {
  static description = "Press a keyboard key.";
  static fields: FieldMetadata[] = [
    field({
      name: "key",
      type: "string",
      description: "Key to press.",
      enum: Object.values(Key),
    }),
  ];

  key: Key;

  constructor(args: { key: Key }) {
    super();
    this.key = args.key;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.pressKey(this.key);
  }
}
