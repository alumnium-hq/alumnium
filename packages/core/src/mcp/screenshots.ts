/**
 * @module MCP Screenshots
 * Screenshot management utilities for MCP server.
 */

import { ensure } from "alwaysly";
import fs from "node:fs";
import path from "node:path";
import { Alumni } from "../client/Alumni.js";
import { getLogger } from "../utils/logger.js";
import { artifactsDirs, stepCounters } from "./state.js";

const logger = getLogger(import.meta.url);

/**
 * Save a screenshot with step number prefix and sanitized description.
 */
export async function saveScreenshot(
  driverId: string,
  description: string,
  al: Alumni,
): Promise<void> {
  try {
    // Get current step number and increment
    const stepNum = stepCounters[driverId];
    ensure(stepNum);
    stepCounters[driverId] = stepNum + 1;

    // Sanitize description for filename
    // Remove special characters and limit length
    let sanitized = description.replace(/[^\w\s-]/g, "");
    sanitized = sanitized.replace(/\s+/g, "-").trim();
    sanitized = sanitized.slice(0, 50); // Truncate to 50 chars

    // Get screenshot directory
    const artifactsDir = artifactsDirs[driverId];
    ensure(artifactsDir);
    const screenshotDir = path.join(artifactsDir, "screenshots");
    fs.mkdirSync(screenshotDir, { recursive: true });

    // Create filename with step number prefix
    const filename = `${String(stepNum).padStart(2, "0")}-${sanitized}.png`;
    const filePath = path.join(screenshotDir, filename);

    // Get base64 screenshot from driver
    const screenshotB64 = await al.driver.screenshot();

    // Decode base64 and save as PNG
    const screenshotBytes = Buffer.from(screenshotB64, "base64");
    fs.writeFileSync(filePath, screenshotBytes);

    logger.debug(`Driver ${driverId}: Saved screenshot to ${filePath}`);
  } catch (error) {
    // Log error but don't fail the operation
    logger.warn(`Failed to save screenshot for driver ${driverId}: ${error}`);
  }
}
