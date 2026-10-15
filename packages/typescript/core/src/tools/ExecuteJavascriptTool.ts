import { BaseDriver } from "../drivers/BaseDriver.ts";
import { BaseTool } from "./BaseTool.ts";
import { field, type FieldMetadata } from "./Field.ts";

export class ExecuteJavascriptTool extends BaseTool {
  static description = "Execute a JavaScript snippet in the browser context.";
  static fields: FieldMetadata[] = [
    field({
      name: "script",
      type: "string",
      description: "JavaScript code to execute",
    }),
  ];

  script: string;

  constructor(args: { script: string }) {
    super();
    this.script = args.script;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.executeScript(this.script);
  }
}
