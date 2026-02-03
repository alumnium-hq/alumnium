import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";

export class SwitchToPreviousTabTool extends BaseTool {
  static description = `Switch to the previous browser tab/window.`;

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.switchToPreviousTab();
  }
}
