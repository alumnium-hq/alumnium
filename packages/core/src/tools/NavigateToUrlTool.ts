import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";
import { field, FieldMetadata } from "./Field.js";

export class NavigateToUrlTool extends BaseTool {
  static description = "Navigate to or open the URL.";
  static fields: FieldMetadata[] = [
    field({
      name: "url",
      type: "string",
      description: "URL to navigate to",
    }),
  ];

  url: string;

  constructor(args: { url: string }) {
    super();
    this.url = args.url;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.visit(this.url);
  }
}
