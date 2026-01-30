import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";

export class SwitchToPreviousTabTool extends BaseTool {
  static description = `Switch to the previous browser tab/window.

Use this when the user asks to:
- Switch to the previous tab
- Go to the previous tab
- Go back to the previous tab
- Move to the previous browser window

If on the first tab, wraps around to the last tab.`;

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.switchToPreviousTab();
  }
}
