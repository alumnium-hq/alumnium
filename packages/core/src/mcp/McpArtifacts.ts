import { ensure } from "alwaysly";
import fs from "node:fs/promises";
import path from "node:path";
import type { Alumni } from "../client/Alumni.js";
import { getLogger } from "../utils/logger.js";
import { McpState } from "./McpState.js";

const logger = getLogger(import.meta.url);

// Base directory for MCP artifacts (screenshots, logs, etc.)
// Defaults to OS temp directory, can be configured via environment variable
const ARTIFACTS_DIR = path.resolve(
  process.env.ALUMNIUM_MCP_ARTIFACTS_DIR || "tmp/alumnium",
);

export async function ensureArtifactsDir(...segments: string[]) {
  const artifactsDir = path.join(ARTIFACTS_DIR, ...segments);
  await fs.mkdir(artifactsDir, { recursive: true });
  return artifactsDir;
}

export namespace McpArtifacts {
  export interface SaveScreenshotProps {
    driverId: string;
    description: string;
    al: Alumni;
  }
}

export abstract class McpArtifacts {
  static async ensureDir(...segments: string[]) {
    const artifactsDir = path.join(ARTIFACTS_DIR, ...segments);
    await fs.mkdir(artifactsDir, { recursive: true });
    return artifactsDir;
  }

  /**
   * Save a screenshot with step number prefix and sanitized description.
   */
  static async saveScreenshot(
    props: McpArtifacts.SaveScreenshotProps,
  ): Promise<void> {
    const { driverId, description, al } = props;
    try {
      // Get current step number and increment
      const stepNum = McpState.stepCounters[driverId];
      ensure(stepNum);
      McpState.stepCounters[driverId] = stepNum + 1;

      // Sanitize description for filename
      // Remove special characters and limit length
      let sanitized = description.replace(/[^\w\s-]/g, "");
      sanitized = sanitized.replace(/\s+/g, "-").trim();
      sanitized = sanitized.slice(0, 50); // Truncate to 50 chars

      // Get screenshot directory
      const artifactsDir = McpState.artifactsDirs[driverId];
      ensure(artifactsDir);
      const screenshotDir = await ensureArtifactsDir(
        artifactsDir,
        "screenshots",
      );

      // Create filename with step number prefix
      const filename = `${String(stepNum).padStart(2, "0")}-${sanitized}.png`;
      const filePath = path.join(screenshotDir, filename);

      // Get base64 screenshot from driver
      const screenshotB64 = await al.driver.screenshot();

      // Decode base64 and save as PNG
      const screenshotBytes = Buffer.from(screenshotB64, "base64");
      await fs.writeFile(filePath, screenshotBytes);

      logger.debug(`Driver ${driverId}: Saved screenshot to ${filePath}`);
    } catch (error) {
      // Log error but don't fail the operation
      logger.warn(`Failed to save screenshot for driver ${driverId}: ${error}`);
    }
  }
}
