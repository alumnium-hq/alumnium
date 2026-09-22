import { BaseDriver } from "../drivers/BaseDriver.ts";
import { Keys } from "../drivers/keys.ts";
import { BaseTool } from "./BaseTool.ts";
import { field, type FieldMetadata } from "./Field.ts";

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
    if (!args?.key || !Keys.enum.includes(args.key)) {
      throw new Error(
        `Unsupported key: "${args?.key}". Supported keys are: ${Keys.enum.join(", ")}`,
      );
    }
    this.key = args.key;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.pressKey(this.key);
  }
}
