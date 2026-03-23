import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";
import { field, type FieldMetadata } from "./Field.js";

export class PrintToPdfTool extends BaseTool {
  static description = "Print the current page to a PDF file.";
  static fields: FieldMetadata[] = [
    field({
      name: "filepath",
      type: "string",
      description: "Path to save the PDF file to",
    }),
  ];

  filepath: string;

  constructor(args: { filepath: string }) {
    super();
    this.filepath = args.filepath;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.printToPdf(this.filepath);
  }
}
