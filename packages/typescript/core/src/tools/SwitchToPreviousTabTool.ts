import { BaseDriver } from "../drivers/BaseDriver.ts";
import { BaseTool } from "./BaseTool.ts";

export class SwitchToPreviousTabTool extends BaseTool {
  static description = `Switch to the previous browser tab/window.`;

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.switchToPreviousTab();
  }
}
