import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";

export class HoverTool extends BaseTool {
  static description = "Hover over an element.";

  id: number;

  constructor(args: { id: number }) {
    super();
    this.id = args.id;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.hover(this.id);
  }
}
