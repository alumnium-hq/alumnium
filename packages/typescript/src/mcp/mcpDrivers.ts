/**
 * Driver factory functions for different platforms.
 */

import { existsSync } from "node:fs";
import type { BrowserContext, Page } from "playwright-core";
import { chromium, devices } from "playwright-core";
import { Builder, type WebDriver } from "selenium-webdriver";
import { Options } from "selenium-webdriver/chrome.js";
import {
  remote as remoteWebdriverio,
  type Browser as WebdriverIoBrowser,
} from "webdriverio";

import type { Driver } from "../drivers/Driver.ts";
import { MaestroSession } from "../drivers/MaestroSession.ts";
import { Env } from "../Env.ts";
import { FileStore } from "../FileStore/FileStore.ts";
import { ensurePlaywrightChromiumInstalled } from "../standalone/installPlaywrightBrowsers.ts";
import { Logger } from "../telemetry/Logger.ts";
import { TypeUtils } from "../typeUtils.ts";
import { proxyFromEnv } from "./proxyFromEnv.ts";

const logger = Logger.get(import.meta.url);

export type McpDriver = Page | WebDriver | WebdriverIoBrowser | MaestroSession;

export namespace McpDriver {
  type PlaywrightCookie = Parameters<BrowserContext["addCookies"]>[0][number];

  export type Cookies = PlaywrightCookie[];
  export type Headers = Record<string, string | Record<string, string>>;

  export interface MobileOptions {
    /**
     * The mobile app to run. Either an identifier of an installed app — an iOS bundle id or an
     * Android package name — or, for Appium, a reference to an app to install: a local `.app`/
     * `.apk`/`.ipa` path, a URL, or a cloud id such as `lt://…`.
     */
    app?: string | undefined;
    appArguments?: string[] | undefined;
    appEnvironment?: Record<string, string> | undefined;
    appReset?: boolean | undefined;
    /**
     * The device to drive: a simulator/emulator UDID or serial, or a device name such as
     * `"iPhone 16"`. Appium gets `appium:udid` for identifiers and `appium:deviceName` for names;
     * Maestro matches identifiers against its connected devices.
     */
    device?: string | undefined;
  }

  export interface Capabilities {
    "appium:settings"?: Record<string, unknown> | undefined;
    [key: string]: unknown;
  }

  /** A device emulation profile: viewport, user agent, and touch/mobile/scale-factor flags. */
  export interface DeviceDescriptor {
    deviceScaleFactor?: number;
    hasTouch?: boolean;
    isMobile?: boolean;
    userAgent?: string;
    viewport?: { width: number; height: number };
  }

  export interface DriverOptions {
    cookies?: Cookies;
    /**
     * Either the name of a Playwright device preset (e.g. `"Pixel 7"`), resolved via
     * `playwright-core`'s `devices` catalog, or a custom `DeviceDescriptor` object (e.g. pasted
     * directly from Playwright's own device list).
     */
    device?: string | DeviceDescriptor;
    executablePath?: string;
    headers?: Headers;
    headless?: boolean;
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

interface SplitHeaders {
  global: Record<string, string>;
  scoped: Record<string, Record<string, string>>;
}

export function splitHeaders(headers: McpDriver.Headers): SplitHeaders {
  const result: SplitHeaders = { global: {}, scoped: {} };
  for (const [key, value] of Object.entries(headers)) {
    if (typeof value === "string") {
      result.global[key] = value;
    } else {
      result.scoped[key] = value;
    }
  }
  return result;
}

export function hostMatchesDomain(hostname: string, domain: string): boolean {
  const host = hostname.toLowerCase();
  const target = domain.toLowerCase();
  if (target.startsWith(".")) {
    return host === target.slice(1) || host.endsWith(target);
  }
  return host === target;
}

export function scopedHeadersFor(
  scoped: SplitHeaders["scoped"],
  url: URL,
): Record<string, string> {
  let result: Record<string, string> = {};
  for (const [domain, headers] of Object.entries(scoped)) {
    if (hostMatchesDomain(url.hostname, domain)) {
      result = { ...result, ...headers };
    }
  }
  return result;
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
    permissions,
    profileDir,
    proxy: explicitProxy,
    recordVideos = Env.ALUMNIUM_MCP_RECORD_VIDEOS,
  } = driverOptions;

  const proxy = explicitProxy ?? proxyFromEnv() ?? undefined;
  // Resolves `device` (catalog name or descriptor object) into viewport/userAgent/isMobile/
  // deviceScaleFactor/hasTouch; an explicit `userAgent` overrides the device-derived one. Empty
  // when unset.
  const deviceOptions = resolveDeviceOptions(driverOptions);

  logger.info(
    `Creating Playwright driver (headless=${headless}, profile=${profileDir ?? "none"})`,
  );

  const { global: globalHeaders, scoped: scopedHeaders } =
    splitHeaders(headers);
  const hasScopedHeaders = Object.keys(scopedHeaders).length > 0;

  if (Object.keys(headers).length) {
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
      ...deviceOptions,
      ...(videosDir ? { recordVideo: { dir: videosDir } } : {}),
      extraHTTPHeaders: globalHeaders,
      ...(executablePath ? { executablePath } : {}),
      ...(proxy ? { proxy } : {}),
    });
  } else {
    const browser = await chromium.launch({
      headless,
      ...(executablePath ? { executablePath } : {}),
      ...(proxy ? { proxy } : {}),
    });
    context = await browser.newContext({
      ...deviceOptions,
      ...(videosDir ? { recordVideo: { dir: videosDir } } : {}),
      extraHTTPHeaders: globalHeaders,
    });
  }

  if (hasScopedHeaders) {
    await context.route(
      (url) => Object.keys(scopedHeadersFor(scopedHeaders, url)).length > 0,
      (route) =>
        route.fallback({
          headers: {
            ...route.request().headers(),
            ...scopedHeadersFor(scopedHeaders, new URL(route.request().url())),
          },
        }),
    );
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
    proxy: explicitProxy,
    userAgent,
  } = driverOptions;

  const { global: globalHeaders, scoped: scopedHeaders } =
    splitHeaders(headers);
  if (Object.keys(scopedHeaders).length) {
    throw new Error(
      `Domain-scoped headers (${Object.keys(scopedHeaders).join(", ")}) are only supported by the Playwright driver (ALUMNIUM_DRIVER=playwright)`,
    );
  }

  const proxy = explicitProxy ?? proxyFromEnv() ?? undefined;

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

  const browserVersion = Env.ALUMNIUM_SELENIUM_BROWSER_VERSION;
  if (browserVersion) {
    logger.debug(`Using Chrome version: ${browserVersion}`);
    chromeOptions.setBrowserVersion(browserVersion);
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

  if (Object.keys(globalHeaders).length || cookies?.length) {
    await cdp.send("Network.enable", {});
  }

  const cdpPromises: Promise<unknown>[] = [];
  if (Object.keys(globalHeaders).length) {
    logger.debug("Setting extra HTTP headers: {headerNames}", {
      headerNames: Object.keys(globalHeaders),
    });
    cdpPromises.push(
      cdp.send("Network.setExtraHTTPHeaders", { headers: globalHeaders }),
    );
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
 * Create a mobile driver from capabilities.
 */
export async function createMobileDriver(
  os: Driver.MobileOs,
  capabilities: McpDriver.Capabilities,
  serverUrl: string | null | undefined,
  mobileOptions: McpDriver.MobileOptions = {},
): Promise<McpDriver> {
  const driverKind = Env.ALUMNIUM_DRIVER;
  logger.info(`Creating mobile driver for ${os} using ${driverKind}`);
  if (driverKind === "maestro") {
    return createMaestroDriver(os, mobileOptions);
  } else {
    translateToAppiumCapabilities(os, capabilities, mobileOptions);
    return createAppiumDriver(os, capabilities, serverUrl);
  }
}

function translateToAppiumCapabilities(
  os: Driver.MobileOs,
  capabilities: McpDriver.Capabilities,
  {
    app,
    device,
    appReset,
    appArguments,
    appEnvironment,
  }: McpDriver.MobileOptions,
): void {
  const translated: [key: string, value: unknown][] = [];
  if (app !== undefined) {
    // An installable goes to `appium:app`; an identifier names an app already on the device.
    const key = isAppReference(app)
      ? "appium:app"
      : os === "ios"
        ? "appium:bundleId"
        : "appium:appPackage";
    translated.push([key, app]);
  }

  if (device !== undefined) {
    translated.push([
      isDeviceIdentifier(device) ? "appium:udid" : "appium:deviceName",
      device,
    ]);
  }
  if (appReset !== undefined) {
    translated.push(["appium:noReset", !appReset]);
    translated.push(["appium:fullReset", appReset]);
  }

  if (appArguments !== undefined || appEnvironment !== undefined) {
    const processArgs: { args?: string[]; env?: Record<string, string> } = {};
    if (appArguments !== undefined) {
      processArgs.args = appArguments;
    }
    if (appEnvironment !== undefined) {
      processArgs.env = appEnvironment;
    }
    translated.push(["appium:processArguments", processArgs]);
  }

  for (const [key, value] of translated) {
    capabilities[key] = value;
  }
}

function isAppReference(application: string): boolean {
  return (
    existsSync(application) ||
    /[\\/]/.test(application) ||
    /^[a-z][a-z0-9+.-]*:\/\//i.test(application) ||
    /\.(apk|aab|ipa|zip)$/i.test(application)
  );
}

/**
 * Tells a device identifier (a UDID or serial) from a device name. Identifiers are what tooling
 * prints: an iOS simulator UUID, a real iOS device's 40-hex or `00008030-…` UDID, an Android
 * `emulator-5554` port name, or an Android serial. Names such as `"iPhone 16"` or `"Pixel 7"`
 * are human words, so whitespace is the deciding tell when no known identifier shape matches.
 */
export function isDeviceIdentifier(device: string): boolean {
  return (
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      device,
    ) ||
    /^[0-9a-f]{40}$/i.test(device) ||
    /^[0-9a-f]{8}-[0-9a-f]{16}$/i.test(device) ||
    /^emulator-\d+$/.test(device) ||
    (!/\s/.test(device) && /\d/.test(device))
  );
}

/**
 * Create Maestro driver from capabilities.
 */
export async function createMaestroDriver(
  os: Driver.MobileOs,
  {
    app,
    device,
    appReset,
    appArguments,
    appEnvironment,
  }: McpDriver.MobileOptions,
): Promise<MaestroSession> {
  if (app === undefined) {
    throw new Error("App must be specified");
  }

  // Maestro drives installed apps only; a path or URL here would become a meaningless flow header.
  if (isAppReference(app)) {
    throw new Error(
      `Maestro cannot install apps. "app" must be the bundle id or package name of an installed app, not a path or URL: ${app}`,
    );
  }

  logger.info(
    `Creating Maestro driver for ${os} (app=${app}, device=${device ?? "first connected"})`,
  );

  const session = await MaestroSession.start({
    appId: app,
    ...(appArguments !== undefined && { launchArgs: appArguments }),
    ...(appEnvironment !== undefined && { launchEnv: appEnvironment }),
    // Which device to drive is per-session state; unset means Maestro's first connected device.
    ...(device !== undefined && { deviceId: device }),
    ...(Env.ALUMNIUM_MAESTRO_PATH !== undefined && {
      executablePath: Env.ALUMNIUM_MAESTRO_PATH,
    }),
  });

  // Maestro acts on whatever is on screen, so the app has to be brought up explicitly.
  const clearState = appReset === true;
  logger.info(`Launching ${app} (clearState=${clearState})`);
  await session.launchApp({ clearState });

  return session;
}

/**
 * Create Appium driver from capabilities.
 */
export async function createAppiumDriver(
  os: Driver.MobileOs,
  capabilities: McpDriver.Capabilities,
  serverUrl: string | null | undefined,
): Promise<WebdriverIoBrowser> {
  const settings = capabilities["appium:settings"] || {};
  delete capabilities["appium:settings"];

  const remoteServer = serverUrl || Env.ALUMNIUM_APPIUM_SERVER;

  logger.info(`Creating Appium driver for ${os} (server=${remoteServer})`);

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

  logger.debug(`Appium driver for ${os} created successfully`);
  return driver;
}

/** Playwright `BrowserContextOptions` fields that describe a device/viewport emulation profile. */
type DeviceOptions = McpDriver.DeviceDescriptor;

/**
 * Resolves `driverOptions.device` into its viewport/userAgent/isMobile/deviceScaleFactor/hasTouch
 * fields — either by looking up a Playwright device-catalog name (e.g. `"Pixel 7"`) or by using a
 * `DeviceDescriptor` object directly — then lets an explicit `driverOptions.userAgent` override the
 * device-derived one. Returns an empty object when `device` is unset, so existing desktop-viewport
 * behavior is unchanged.
 */
function resolveDeviceOptions(
  driverOptions: McpDriver.DriverOptions,
): DeviceOptions {
  const { device, userAgent } = driverOptions;

  let resolved: DeviceOptions = {};
  if (typeof device === "string") {
    const descriptor = devices[device];
    if (!descriptor) {
      throw new Error(
        `Unknown device "${device}". See Playwright's devices catalog for supported names.`,
      );
    }
    resolved = {
      deviceScaleFactor: descriptor.deviceScaleFactor,
      hasTouch: descriptor.hasTouch,
      isMobile: descriptor.isMobile,
      userAgent: descriptor.userAgent,
      viewport: descriptor.viewport,
    };
  } else if (device !== undefined) {
    resolved = sanitizeDeviceDescriptor(device);
  }

  return {
    ...resolved,
    ...(userAgent !== undefined && { userAgent }),
  };
}

/**
 * Picks only the recognized `DeviceDescriptor` fields off an arbitrary object, so a raw Playwright
 * device descriptor (which also carries fields like `defaultBrowserType`/`screen`) can be passed
 * in as `driverOptions.device` as-is.
 */
function sanitizeDeviceDescriptor(value: object): McpDriver.DeviceDescriptor {
  const source = value as Record<string, unknown>;
  const viewport = source["viewport"] as Record<string, unknown> | undefined;

  return {
    ...(typeof source["userAgent"] === "string" && {
      userAgent: source["userAgent"],
    }),
    ...(typeof source["deviceScaleFactor"] === "number" && {
      deviceScaleFactor: source["deviceScaleFactor"],
    }),
    ...(typeof source["isMobile"] === "boolean" && {
      isMobile: source["isMobile"],
    }),
    ...(typeof source["hasTouch"] === "boolean" && {
      hasTouch: source["hasTouch"],
    }),
    ...(typeof viewport === "object" &&
      viewport !== null &&
      typeof viewport["width"] === "number" &&
      typeof viewport["height"] === "number" && {
        viewport: { width: viewport["width"], height: viewport["height"] },
      }),
  };
}
