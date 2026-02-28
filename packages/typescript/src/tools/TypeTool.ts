import { BaseDriver } from "../drivers/BaseDriver.js";
import { BaseTool } from "./BaseTool.js";
import { field, FieldMetadata } from "./Field.js";

export class TypeTool extends BaseTool {
  static description =
    "Type text into an element. Automatically focuses the element and clears it before typing.";
  static fields: FieldMetadata[] = [
    field({
      name: "id",
      type: "integer",
      description: "Element identifier (ID)",
    }),
    field({
      name: "text",
      type: "string",
      description: "Text to type into an element",
    }),
  ];

  id: number;
  text: string;

  constructor(args: { id: number; text: string }) {
    super();
    this.id = args.id;
    this.text = args.text;
  }

  async invoke(driver: BaseDriver): Promise<void> {
    await driver.type(this.id, this.text);
  }
}
