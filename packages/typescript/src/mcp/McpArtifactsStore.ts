import { kebabCase } from "case-anything";
import { FileStore } from "../FileStore/FileStore.ts";
import { Logger } from "../telemetry/Logger.ts";
import { McpState } from "./McpState.ts";

const logger = Logger.get(import.meta.url);

export namespace McpArtifactsStore {
  export interface SaveScreenshotProps {
    id: string;
    description: string;
  }
}

export class McpArtifactsStore extends FileStore {
  constructor(id: string) {
    super(
      FileStore.subResolve(
        process.env.ALUMNIUM_MCP_ARTIFACTS_DIR,
        "artifacts",
        id,
      ),
    );
  }

  /**
   * Save a screenshot with step number prefix and sanitized description.
   */
  static async saveScreenshot(
    props: McpArtifactsStore.SaveScreenshotProps,
  ): Promise<string | null> {
    const { id, description } = props;
    try {
      const driverState = McpState.getDriverState(id);

      // TODO: It is a bad idea to manage step number here in the artifacts
      // store. A better place would be McpState and the `saveScreenshot` method
      // would only accept the step number as a prop.
      const stepNum = McpState.incrementStepNum(id);

      // Sanitize description for filename
      // Remove special characters and limit length
      const normalizedDesc = kebabCase(description).slice(0, 50);

      // Get base64 screenshot from driver
      const screenshotB64 = await driverState.al.driver.screenshot();

      // Decode base64 and save as PNG
      const screenshotBytes = Buffer.from(screenshotB64, "base64");
      const fileName = `${String(stepNum).padStart(2, "0")}-${normalizedDesc}.png`;
      const filePath = await driverState.artifactsStore.writeFile(
        `screenshots/${fileName}`,
        screenshotBytes,
      );

      logger.debug(`Driver ${id}: Saved screenshot to ${filePath}`);

      return filePath;
    } catch (error) {
      // Log error but don't fail the operation
      logger.warn(`Failed to save screenshot for driver ${id}: ${error}`);
      return null;
    }
  }
}
