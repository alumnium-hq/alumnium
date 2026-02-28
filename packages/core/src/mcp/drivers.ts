/** Driver factory functions for different platforms. */

import path from "node:path";
import {
  chromium,
  type Browser,
  type BrowserContext,
  type Page,
} from "playwright";
import { Builder, type WebDriver } from "selenium-webdriver";
import { Options } from "selenium-webdriver/chrome.js";
import { getLogger } from "../utils/logger.js";

const logger = getLogger(import.meta.url);

export type McpDriver = Page | WebDriver;

export namespace McpDriver {
  export type PlaywrightCookie = Parameters<
    BrowserContext["addCookies"]
  >[0][number];

  export type PlaywrightHeaders = (Parameters<
    Browser["newContext"]
  >[0] & {})["extraHTTPHeaders"] & {};

  export interface Capabilities {
    headers?: PlaywrightHeaders | undefined;
    cookies?: PlaywrightCookie[] | undefined;
    permissions?: string[] | undefined;
    "appium:settings"?: Record<string, unknown> | undefined;
    [key: string]: unknown;
  }

  export interface SeleniumCdpConnection {
    send(method: string, params: Record<string, unknown>): Promise<unknown>;
  }
}

export function createChromeDriver(
  capabilities: McpDriver.Capabilities,
  serverUrl: string | null | undefined,
  artifactsDir: string,
): Promise<McpDriver> {
  const driverType = (process.env.ALUMNIUM_DRIVER || "selenium").toLowerCase();
  logger.info(`Creating Chrome driver using ${driverType}`);
  if (driverType === "playwright") {
    return createPlaywrightDriver(capabilities, artifactsDir);
  } else {
    return createSeleniumDriver(capabilities, serverUrl);
  }
}

/**
 * Create Playwright driver from capabilities.
 */
export async function createPlaywrightDriver(
  capabilities: McpDriver.Capabilities,
  artifactsDir: string,
): Promise<Page> {
  const headless =
    (process.env.ALUMNIUM_PLAYWRIGHT_HEADLESS || "true").toLowerCase() ===
    "true";
  logger.info(`Creating Playwright driver (headless=${headless})`);

  const browser = await chromium.launch({ headless });

  const headers = capabilities["headers"] || {};
  if (Object.keys(headers).length) {
    logger.debug("Setting extra HTTP headers: {headers}", { headers });
  }

  const context: BrowserContext = await browser.newContext({
    recordVideo: { dir: path.join(artifactsDir, "videos") },
    extraHTTPHeaders: headers,
  });

  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });

  const { cookies, permissions } = capabilities;

  if (cookies) {
    logger.debug("Adding cookies: {cookies}", { cookies });
    for (const cookie of cookies) {
      cookie["path"] ??= "/";
    }
    await context.addCookies(cookies);
  }

  if (permissions) {
    logger.debug("Granting permissions: {permissions}", { permissions });
    await context.grantPermissions(permissions);
  }

  const page = await context.newPage();

  logger.debug("Playwright driver created successfully");
  return page;
}

/**
 * Create Selenium Chrome driver from capabilities.
 */
export async function createSeleniumDriver(
  capabilities: McpDriver.Capabilities,
  serverUrl: string | null | undefined,
): Promise<WebDriver> {
  logger.info(`Creating Selenium driver (serverUrl=${serverUrl || "local"})`);

  const { headers, cookies, ...seleniumCapabilities } = capabilities;

  const options = new Options();

  // Apply all capabilities to options
  for (const [key, value] of Object.entries(seleniumCapabilities)) {
    if (key !== "platformName") {
      options.set(key, value);
    }
  }

  // Use remote driver if serverUrl provided, otherwise local Chrome
  const builder = new Builder().forBrowser("chrome").setChromeOptions(options);
  if (serverUrl) {
    builder.usingServer(serverUrl);
  }
  const driver = await builder.build();
  const cdp: McpDriver.SeleniumCdpConnection =
    await driver.createCDPConnection("page");

  const cdpPromises: Promise<unknown>[] = [];

  if (headers || cookies) {
    cdpPromises.push(cdp.send("Network.enable", {}));
  }

  if (headers) {
    logger.debug("Setting extra HTTP headers: {headerNames}", {
      headerNames: Object.keys(headers),
    });
    cdpPromises.push(cdp.send("Network.setExtraHTTPHeaders", { headers }));
  }

  if (cookies) {
    logger.debug(`Adding ${cookies.length} cookie(s)`);
    cdpPromises.push(cdp.send("Network.setCookies", { cookies }));
  }

  await Promise.all(cdpPromises);

  logger.debug("Selenium driver created successfully");
  return driver;
}

export async function createIosDriver(
  capabilities: McpDriver.Capabilities,
  serverUrl: string | null | undefined,
): Promise<unknown> {
  return {};
}

export async function createAndroidDriver(
  capabilities: McpDriver.Capabilities,
  serverUrl: string | null | undefined,
): Promise<unknown> {
  return {};
}
