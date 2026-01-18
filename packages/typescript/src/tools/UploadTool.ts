import { PlaywrightDriver } from "../drivers/PlaywrightDriver.js";
import { SeleniumDriver } from "../drivers/SeleniumDriver.js";
import { BaseTool } from "./BaseTool.js";
import { field, FieldMetadata } from "./Field.js";

export class UploadTool extends BaseTool {
  static description =
    "Upload one or more files using a button that opens a file chooser. " +
    "This tool automatically clicks the button, DO NOT use ClickTool for that.";
  static fields: FieldMetadata[] = [
    field({
      name: "id",
      type: "integer",
      description: "Element identifier (ID)",
    }),
    field({
      name: "paths",
      type: "array",
      description:
        "Absolute file path(s) to upload. Can be a single path or multiple paths for multi-file upload.",
      items: { type: "string" },
    }),
  ];

  id: number;
  paths: string[];

  constructor(args: { id: number; paths: string[] }) {
    super();
    this.id = args.id;
    this.paths = this.normalizePaths(args.paths);
  }

  async invoke(driver: PlaywrightDriver | SeleniumDriver): Promise<void> {
    await driver.upload(this.id, this.paths);
  }

  private normalizePaths(paths: string[]): string[] {
    // Planner often attempts to "escape" file paths by adding backslashes.
    // It also often surrounds paths with quotes.
    return paths.map((path) => {
      return path.replace(/\\+\//g, "/").replace(/^["']|["']$/g, "");
    });
  }
}
