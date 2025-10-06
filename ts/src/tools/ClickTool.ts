import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";

export class ClickTool extends BaseTool {
  static description = "Click an element.";

  id: number;

  constructor(args: { id: number }) {
    super();
    this.id = args.id;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.click(this.id);
  }
}
