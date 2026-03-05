import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";

export class SwitchToNextTabTool extends BaseTool {
  static description = `Switch to the next browser tab/window.`;

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.switchToNextTab();
  }
}
