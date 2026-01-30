import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";
import { field, FieldMetadata } from "./Field.js";

export class WaitForElementTool extends BaseTool {
  static description = `Wait for an element matching a CSS selector to become visible.

Use this when:
- You need to wait for a specific element to appear on the page
- Content is loaded dynamically and you need to wait for it
- You want to ensure an element is visible before interacting with it

This is preferred over fixed waits (WaitTool) when you know what element you're waiting for.`;

  static fields: FieldMetadata[] = [
    field({
      name: "selector",
      type: "string",
      description: "CSS selector for the element to wait for",
    }),
    field({
      name: "timeout",
      type: "number",
      description: "Maximum time to wait in seconds (default: 10)",
      required: false,
    }),
  ];

  selector: string;
  timeout?: number;

  constructor(args: { selector: string; timeout?: number }) {
    super();
    this.selector = args.selector;
    this.timeout = args.timeout;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.waitForSelector(this.selector, this.timeout);
  }
}
