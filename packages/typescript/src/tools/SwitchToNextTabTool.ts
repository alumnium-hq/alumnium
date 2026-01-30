import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";

export class SwitchToNextTabTool extends BaseTool {
  static description = `Switch to the next browser tab/window.

Use this when the user asks to:
- Switch to the next tab
- Go to the next tab
- Move to the next browser window
- Cycle to the next tab

If on the last tab, wraps around to the first tab.`;

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.switchToNextTab();
  }
}
