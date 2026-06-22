/**
 * Driver factory functions for different platforms.
 */

import type { BrowserContext, Page } from "playwright-core";
import { chromium } from "playwright-core";
import { Builder, type WebDriver } from "selenium-webdriver";
import { ensurePlaywrightChromiumInstalled } from "../standalone/installPlaywrightBrowsers.ts";
import { Options } from "selenium-webdriver/chrome.js";
import {
  remote as remoteWebdriverio,
  type Browser as WebdriverIoBrowser,
} from "webdriverio";
import type { Driver } from "../drivers/Driver.ts";
import { Env } from "../Env.ts";
import { FileStore } from "../FileStore/FileStore.ts";
import { proxyFromEnv } from "./proxyFromEnv.ts";
import { Logger } from "../telemetry/Logger.ts";
import { TypeUtils } from "../typeUtils.ts";

const logger = Logger.get(import.meta.url);

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
    httpProxy?: boolean;
    permissions?: string[];
    profileDir?: string;
    proxy?: {
      server: string;
      bypass?: string;
      username?: string;
      password?: string;
    };
    recordVideos?: boolean;
    userAgent?: string;
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
  const driverKind = Env.ALUMNIUM_DRIVER;
  logger.info(`Creating Chrome driver using ${driverKind}`);
  if (driverKind === "playwright") {
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
    httpProxy,
    permissions,
    profileDir,
    proxy: explicitProxy,
    recordVideos = Env.ALUMNIUM_MCP_RECORD_VIDEOS,
    userAgent,
  } = driverOptions;

  const proxy =
    explicitProxy ?? (httpProxy ? (proxyFromEnv() ?? undefined) : undefined);

  logger.info(
    `Creating Playwright driver (headless=${headless}, profile=${profileDir ?? "none"})`,
  );

  if (headers) {
    logger.debug("Setting extra HTTP headers: {headers}", { headers });
  }

  await ensurePlaywrightChromiumInstalled();
  const videosDir = recordVideos
    ? await artifactsStore.ensureDir("videos")
    : undefined;

  let context: BrowserContext;
  if (profileDir) {
    context = await chromium.launchPersistentContext(profileDir, {
      headless,
      ...(videosDir ? { recordVideo: { dir: videosDir } } : {}),
      extraHTTPHeaders: headers,
      ...(executablePath ? { executablePath } : {}),
      ...(proxy ? { proxy } : {}),
      ...(userAgent ? { userAgent } : {}),
    });
  } else {
    const browser = await chromium.launch({
      headless,
      ...(executablePath ? { executablePath } : {}),
      ...(proxy ? { proxy } : {}),
    });
    context = await browser.newContext({
      ...(videosDir ? { recordVideo: { dir: videosDir } } : {}),
      extraHTTPHeaders: headers,
      ...(userAgent ? { userAgent } : {}),
    });
  }

  await context.tracing.start({
    screenshots: true,
    snapshots: true,
    // Capturing call-site sources fails in the Bun single-file executable
    // because the recorded paths (e.g. /$bunfs/root/...) do not exist on disk.
    sources: false,
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
    proxy,
    userAgent,
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

  if (proxy) {
    chromeOptions.addArguments(`--proxy-server=${proxy.server}`);
    if (proxy.bypass) {
      chromeOptions.addArguments(`--proxy-bypass-list=${proxy.bypass}`);
    }
  }

  if (userAgent) {
    chromeOptions.addArguments(`--user-agent=${userAgent}`);
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
 * Create Appium driver from capabilities.
 */
export async function createAppiumDriver(
  platform: Driver.AppiumPlatform,
  capabilities: McpDriver.Capabilities,
  serverUrl: string | null | undefined,
): Promise<WebdriverIoBrowser> {
  const settings = capabilities["appium:settings"] || {};
  delete capabilities["appium:settings"];

  const remoteServer = serverUrl || Env.ALUMNIUM_APPIUM_SERVER;

  logger.info(
    `Creating Appium driver for ${platform} (server=${remoteServer})`,
  );

  const remoteServerUrl = new URL(remoteServer);
  const remoteOptions =
    TypeUtils.fromExactOptionalTypes<McpDriver.WebdriverioProps>({
      protocol: remoteServerUrl.protocol.replace(":", ""),
      hostname: remoteServerUrl.hostname,
      port:
        +remoteServerUrl.port ||
        (remoteServerUrl.protocol === "https:" ? 443 : 80),
      path: `${remoteServerUrl.pathname}${remoteServerUrl.search}`,
      capabilities,
      enableDirectConnect: true,
    });

  const ltUsername = Env.LT_USERNAME;
  if (ltUsername) remoteOptions.user = ltUsername;

  const ltAccessKey = Env.LT_ACCESS_KEY;
  if (ltAccessKey) remoteOptions.key = ltAccessKey;

  const driver = await remoteWebdriverio(remoteOptions);

  if (Object.keys(settings).length) {
    logger.debug("Applying Appium settings: {settings}", { settings });
    await driver.updateSettings(settings);
  }

  logger.debug(`Appium driver for ${platform} created successfully`);
  return driver;
}
