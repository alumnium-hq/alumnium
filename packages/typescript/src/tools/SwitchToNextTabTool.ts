import { BaseDriver } from "../drivers/BaseDriver.ts";
import { BaseTool } from "./BaseTool.ts";

export class SwitchToNextTabTool extends BaseTool {
  static description = `Switch to the next browser tab/window.`;

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.switchToNextTab();
  }
}
