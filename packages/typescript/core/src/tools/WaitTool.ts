import { BaseDriver } from "../drivers/BaseDriver.ts";
import { BaseTool } from "./BaseTool.ts";
import { field, type FieldMetadata } from "./Field.ts";

export class WaitTool extends BaseTool {
  static description = `Wait for a specified number of seconds.

Use this when:
- The page needs time to load or update
- You need to wait for animations to complete
- You need a brief pause before the next action

The wait duration is clamped between 1 and 30 seconds.`;

  static fields: FieldMetadata[] = [
    field({
      name: "seconds",
      type: "number",
      description: "Number of seconds to wait (1-30)",
    }),
  ];

  seconds: number;

  constructor(args: { seconds: number }) {
    super();
    this.seconds = args.seconds;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.wait(this.seconds);
  }
}
