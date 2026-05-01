/**
 * Driver factory functions for different platforms.
 */

import type { BrowserContext, Page } from "playwright-core";
import { chromium } from "playwright-core";
import { Builder, type WebDriver } from "selenium-webdriver";
import { Options } from "selenium-webdriver/chrome.js";
import {
  remote as remoteWebdriverio,
  type Browser as WebdriverIoBrowser,
} from "webdriverio";
import { FileStore } from "../FileStore/FileStore.ts";
import { TypeUtils } from "../typeUtils.ts";
import { getLogger } from "../utils/logger.ts";

const logger = getLogger(import.meta.url);

export type McpDriver = Page | WebDriver | WebdriverIoBrowser;

export namespace McpDriver {
  type PlaywrightCookie = Parameters<BrowserContext["addCookies"]>[0][number];

  export type Cookies = PlaywrightCookie[];
  export type Headers = Record<string, string>;

  export interface Capabilities {
    "appium:settings"?: Record<string, unknown> | undefined;
    [key: string]: unknown;
  }

  export interface DriverOptions {
    cookies?: Cookies;
    executablePath?: string;
    headers?: Headers;
    headless?: boolean;
    permissions?: string[];
    profileDir?: string;
  }

  export interface SeleniumCdpConnection {
    send(method: string, params: Record<string, unknown>): Promise<unknown>;
  }

  export type WebdriverioProps = Parameters<typeof remoteWebdriverio>[0];
}

export function createChromeDriver(
  capabilities: McpDriver.Capabilities,
  serverUrl: string | null | undefined,
  artifactsStore: FileStore,
  driverOptions: McpDriver.DriverOptions = {},
): Promise<McpDriver> {
  const driverType = (process.env.ALUMNIUM_DRIVER || "selenium").toLowerCase();
  logger.info(`Creating Chrome driver using ${driverType}`);
  if (driverType === "playwright") {
    return createPlaywrightDriver(capabilities, artifactsStore, driverOptions);
  } else {
    return createSeleniumDriver(capabilities, serverUrl, driverOptions);
  }
}

/**
 * Create Playwright driver from capabilities.
 */
export async function createPlaywrightDriver(
  _capabilities: McpDriver.Capabilities,
  artifactsStore: FileStore,
  driverOptions: McpDriver.DriverOptions = {},
): Promise<Page> {
  const {
    cookies,
    executablePath,
    headless = false,
    headers = {},
    permissions,
    profileDir,
  } = driverOptions;

  logger.info(
    `Creating Playwright driver (headless=${headless}, profile=${profileDir ?? "none"})`,
  );

  if (headers) {
    logger.debug("Setting extra HTTP headers: {headers}", { headers });
  }

  const videosDir = await artifactsStore.ensureDir("videos");

  let context: BrowserContext;
  if (profileDir) {
    context = await chromium.launchPersistentContext(profileDir, {
      headless,
      recordVideo: { dir: videosDir },
      extraHTTPHeaders: headers,
      ...(executablePath ? { executablePath } : {}),
    });
  } else {
    const browser = await chromium.launch({
      headless,
      ...(executablePath ? { executablePath } : {}),
    });
    context = await browser.newContext({
      recordVideo: { dir: videosDir },
      extraHTTPHeaders: headers,
    });
  }

  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    sources: true,
  });

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

  // Persistent context typically loads with a page.
  const page = context.pages()[0] ?? (await context.newPage());

  logger.debug("Playwright driver created successfully");
  return page;
}

/**
 * Create Selenium Chrome driver from capabilities.
 */
export async function createSeleniumDriver(
  capabilities: McpDriver.Capabilities,
  serverUrl: string | null | undefined,
  driverOptions: McpDriver.DriverOptions = {},
): Promise<WebDriver> {
  logger.info(
    `Creating Selenium driver (serverUrl=${serverUrl || "local"}, profile=${driverOptions.profileDir ?? "none"})`,
  );

  const {
    cookies,
    executablePath,
    headers = {},
    headless = false,
    profileDir,
  } = driverOptions;

  const chromeOptions = new Options();
  // Disable verbose logging so it doesn't print to stdout and interfere with
  // MCP output parsing. Currently it only appears on Windows but may also
  // happen on other platforms.
  chromeOptions.addArguments("--disable-logging", "--log-level=3");
  chromeOptions.excludeSwitches("enable-logging");

  if (executablePath) {
    logger.debug("Using custom Chrome binary: {executablePath}", {
      executablePath,
    });
    chromeOptions.setBinaryPath(executablePath);
  }

  if (profileDir) {
    chromeOptions.addArguments(`--user-data-dir=${profileDir}`);
  }

  if (headless) {
    chromeOptions.addArguments("--headless=new");
  }

  // Apply all capabilities to options.
  //
  // `goog:chromeOptions` is special-cased: setting it via `chromeOptions.set(...)`
  // would replace the entire dict at that capability key, losing the built-in
  // args/excludeSwitches set above and de-syncing the internal `options_` cache
  // that `addArguments`/`addExtensions`/`setBinaryPath` mutate. Translate caller-
  // supplied `args`/`extensions`/`binary` to the proper helpers so they merge
  // cleanly with built-in state and actually reach the spawned browser.
  for (const [key, value] of Object.entries(capabilities)) {
    if (key === "platformName") {
      continue;
    }
    if (key === "goog:chromeOptions" && value && typeof value === "object") {
      const chromeOpts = value as {
        args?: string[];
        extensions?: (string | Buffer)[];
        binary?: string;
      };
      if (chromeOpts.args?.length) {
        chromeOptions.addArguments(...chromeOpts.args);
      }
      if (chromeOpts.extensions?.length) {
        chromeOptions.addExtensions(...chromeOpts.extensions);
      }
      if (chromeOpts.binary) {
        chromeOptions.setBinaryPath(chromeOpts.binary);
      }
      continue;
    }
    chromeOptions.set(key, value);
  }

  // Use remote driver if serverUrl provided, otherwise local Chrome
  const builder = new Builder()
    .forBrowser("chrome")
    .setChromeOptions(chromeOptions);
  if (serverUrl) {
    builder.usingServer(serverUrl);
  }
  const driver = await builder.build();
  const cdp: McpDriver.SeleniumCdpConnection =
    await driver.createCDPConnection("page");

  if (Object.keys(headers).length || cookies?.length) {
    await cdp.send("Network.enable", {});
  }

  const cdpPromises: Promise<unknown>[] = [];
  if (Object.keys(headers).length) {
    logger.debug("Setting extra HTTP headers: {headerNames}", {
      headerNames: Object.keys(headers),
    });
    cdpPromises.push(cdp.send("Network.setExtraHTTPHeaders", { headers }));
  }

  if (cookies?.length) {
    logger.debug(`Adding ${cookies.length} cookie(s)`);
    cdpPromises.push(cdp.send("Network.setCookies", { cookies }));
  }

  await Promise.all(cdpPromises);

  logger.debug("Selenium driver created successfully");
  return driver;
}

/**
 * Create Appium iOS driver from capabilities.
 */
export async function createIosDriver(
  capabilities: McpDriver.Capabilities,
  serverUrl: string | null | undefined,
): Promise<WebdriverIoBrowser> {
  const settings = capabilities["appium:settings"] || {};
  delete capabilities["appium:settings"];

  const remoteServer =
    serverUrl || process.env.ALUMNIUM_APPIUM_SERVER || "http://localhost:4723";

  logger.info(`Creating iOS driver (server=${remoteServer})`);

  const remoteServerUrl = new URL(remoteServer);
  const remoteOptions =
    TypeUtils.polyfillExactOptionalPropertyTypes<McpDriver.WebdriverioProps>({
      protocol: remoteServerUrl.protocol.replace(":", ""),
      hostname: remoteServerUrl.hostname,
      port:
        Number.parseInt(remoteServerUrl.port, 10) ||
        (remoteServerUrl.protocol === "https:" ? 443 : 80),
      path: `${remoteServerUrl.pathname}${remoteServerUrl.search}`,
      capabilities,
      enableDirectConnect: true,
    });

  if (process.env.LT_USERNAME) {
    remoteOptions.user = process.env.LT_USERNAME;
  }
  if (process.env.LT_ACCESS_KEY) {
    remoteOptions.key = process.env.LT_ACCESS_KEY;
  }

  const driver = await remoteWebdriverio(remoteOptions);

  if (Object.keys(settings).length) {
    logger.debug("Applying Appium settings: {settings}", { settings });
    await driver.updateSettings(settings);
  }

  logger.debug("iOS driver created successfully");
  return driver;
}

/**
 * Create Appium Android driver from capabilities.
 */
export async function createAndroidDriver(
  capabilities: McpDriver.Capabilities,
  serverUrl: string | null | undefined,
): Promise<WebdriverIoBrowser> {
  const settings =
    (capabilities["appium:settings"] as Record<string, unknown> | undefined) ||
    {};
  delete capabilities["appium:settings"];

  const remoteServer =
    serverUrl || process.env.ALUMNIUM_APPIUM_SERVER || "http://localhost:4723";

  logger.info(`Creating Android driver (server=${remoteServer})`);

  const remoteServerUrl = new URL(remoteServer);
  const remoteOptions =
    TypeUtils.polyfillExactOptionalPropertyTypes<McpDriver.WebdriverioProps>({
      protocol: remoteServerUrl.protocol.replace(":", ""),
      hostname: remoteServerUrl.hostname,
      port:
        +remoteServerUrl.port ||
        (remoteServerUrl.protocol === "https:" ? 443 : 80),
      path: `${remoteServerUrl.pathname}${remoteServerUrl.search}`,
      capabilities,
      enableDirectConnect: true,
    });

  if (process.env.LT_USERNAME) {
    remoteOptions.user = process.env.LT_USERNAME;
  }
  if (process.env.LT_ACCESS_KEY) {
    remoteOptions.key = process.env.LT_ACCESS_KEY;
  }

  const driver = await remoteWebdriverio(remoteOptions);

  if (Object.keys(settings).length) {
    logger.debug("Applying Appium settings: {settings}", { settings });
    await driver.updateSettings(settings);
  }

  logger.debug("Android driver created successfully");
  return driver;
}
