import { BaseDriver } from "../drivers/BaseDriver.js";
import { Keys } from "../drivers/keys.js";
import { BaseTool } from "./BaseTool.js";
import { field, type FieldMetadata } from "./Field.js";

export class PressKeyTool extends BaseTool {
  static description =
    "Press a keyboard key. Does not require element to be focused.";
  static fields: FieldMetadata[] = [
    field({
      name: "key",
      type: "string",
      description: "Key to press.",
      enum: Keys.enum,
    }),
  ];

  key: Keys.Key;

  constructor(args: { key: Keys.Key }) {
    super();
    this.key = args.key;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.pressKey(this.key);
  }
}
