import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";

export class NavigateBackTool extends BaseTool {
  static description = `Navigate back to the previous page/screen using the browser/app history.

Use this when the user asks to:
- Go back
- Navigate back to the previous page
- Return to the previous page
- Use browser back button
- Go to the previous screen

This uses the browser's history navigation instead of clicking visible "Back" links or buttons.`;

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.back();
  }
}
