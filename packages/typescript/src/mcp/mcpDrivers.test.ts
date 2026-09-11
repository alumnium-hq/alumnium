import type { WebDriver } from "selenium-webdriver";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { Env } from "../Env.ts";
import { FileStore } from "../FileStore/FileStore.ts";
import {
  createMobileDriver,
  createPlaywrightDriver,
  createSeleniumDriver,
} from "./mcpDrivers.ts";

const mocks = vi.hoisted(() => {
  class MockOptions {
    args: string[] = [];
    excludedSwitches: string[] = [];
    binaryPath: string | undefined;
    capabilities: Record<string, unknown> = {};

    addArguments(...args: string[]) {
      this.args.push(...args);
      return this;
    }

    excludeSwitches(...switches: string[]) {
      this.excludedSwitches.push(...switches);
      return this;
    }

    setBinaryPath(path: string) {
      this.binaryPath = path;
      return this;
    }

    setBrowserVersion(version: string) {
      this.capabilities.browserVersion = version;
      return this;
    }

    set(key: string, value: unknown) {
      this.capabilities[key] = value;
      return this;
    }

    addExtensions(...extensions: (string | Buffer)[]) {
      this.capabilities.extensions = extensions;
      return this;
    }
  }

  class MockBuilder {
    browser: string | undefined;
    chromeOptions: MockOptions | undefined;
    serverUrl: string | undefined;

    forBrowser(browser: string) {
      this.browser = browser;
      return this;
    }

    setChromeOptions(options: MockOptions) {
      this.chromeOptions = options;
      return this;
    }

    usingServer(serverUrl: string) {
      this.serverUrl = serverUrl;
      return this;
    }

    async build() {
      return mockDriver;
    }
  }

  const cdpSend = vi.fn(async () => null);
  const mockDriver = {
    createCDPConnection: vi.fn(async () => ({ send: cdpSend })),
  };

  return {
    builders: [] as MockBuilder[],
    cdpSend,
    driver: mockDriver,
    MockBuilder,
    MockOptions,
    options: [] as MockOptions[],
  };
});

const mobileMocks = vi.hoisted(() => {
  const launchApp = vi.fn(async (_options: { clearState: boolean }) => {});
  const maestroStart = vi.fn(async (props: Record<string, unknown>) => ({
    props,
    launchApp,
  }));
  const updateSettings = vi.fn(async () => {});
  const remote = vi.fn(async (options: { capabilities: unknown }) => ({
    capabilities: options.capabilities,
    updateSettings,
  }));
  return { launchApp, maestroStart, remote, updateSettings };
});

vi.mock("webdriverio", () => ({ remote: mobileMocks.remote }));

vi.mock("../drivers/MaestroSession.ts", () => ({
  MaestroSession: { start: mobileMocks.maestroStart },
}));

vi.mock("selenium-webdriver", () => ({
  Builder: class extends mocks.MockBuilder {
    constructor() {
      super();
      mocks.builders.push(this);
    }
  },
}));

vi.mock("selenium-webdriver/chrome.js", () => ({
  Options: class extends mocks.MockOptions {
    constructor() {
      super();
      mocks.options.push(this);
    }
  },
}));

const playwrightMocks = vi.hoisted(() => {
  type RouteHandler = (route: {
    fallback: (overrides: { headers: Record<string, string> }) => Promise<void>;
    request: () => { headers: () => Record<string, string>; url: () => string };
  }) => Promise<void>;
  type RouteCall = [(url: URL) => boolean, RouteHandler];

  const routeCalls: RouteCall[] = [];

  function makeContext() {
    return {
      addCookies: vi.fn(async () => undefined),
      grantPermissions: vi.fn(async () => undefined),
      newPage: vi.fn(async () => ({})),
      pages: vi.fn(() => []),
      route: vi.fn(async (...call: RouteCall) => {
        routeCalls.push(call);
      }),
      tracing: { start: vi.fn(async () => undefined) },
    };
  }

  const newContextCalls: Record<string, unknown>[] = [];
  const launchPersistentContextCalls: Record<string, unknown>[] = [];

  const newContext = vi.fn(async (options: Record<string, unknown>) => {
    newContextCalls.push(options);
    return makeContext();
  });

  const launchPersistentContext = vi.fn(
    async (_profileDir: string, options: Record<string, unknown>) => {
      launchPersistentContextCalls.push(options);
      return makeContext();
    },
  );

  return {
    devices: {
      "Pixel 7": {
        deviceScaleFactor: 2.625,
        hasTouch: true,
        isMobile: true,
        userAgent:
          "Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/148 Mobile Safari/537.36",
        viewport: { width: 412, height: 839 },
      },
    } as Record<string, unknown>,
    launch: vi.fn(async () => ({ newContext })),
    launchPersistentContext,
    launchPersistentContextCalls,
    newContext,
    newContextCalls,
    routeCalls,
  };
});

vi.mock("playwright-core", () => ({
  chromium: {
    launch: playwrightMocks.launch,
    launchPersistentContext: playwrightMocks.launchPersistentContext,
  },
  devices: playwrightMocks.devices,
}));

vi.mock("../standalone/installPlaywrightBrowsers.ts", () => ({
  ensurePlaywrightChromiumInstalled: vi.fn(async () => undefined),
}));

describe("createPlaywrightDriver", () => {
  const artifactsStore = new FileStore("test-artifacts");

  beforeEach(() => {
    playwrightMocks.newContextCalls.length = 0;
    playwrightMocks.launchPersistentContextCalls.length = 0;
    playwrightMocks.routeCalls.length = 0;
    vi.clearAllMocks();
  });

  it("sends string-valued headers with every request", async () => {
    await createPlaywrightDriver({}, artifactsStore, {
      headers: { "X-Custom": "1" },
      recordVideos: false,
    });

    expect(playwrightMocks.newContextCalls[0]?.extraHTTPHeaders).toEqual({
      "X-Custom": "1",
    });
    expect(playwrightMocks.routeCalls).toHaveLength(0);
  });

  it("sends object-valued headers only to hosts matching their domain key", async () => {
    await createPlaywrightDriver({}, artifactsStore, {
      headers: {
        Authorization: "Bearer token",
        ".example.com": { "X-Feature": "on" },
        "api.other.dev": { "X-Api": "1" },
      },
      recordVideos: false,
    });

    expect(playwrightMocks.newContextCalls[0]?.extraHTTPHeaders).toEqual({
      Authorization: "Bearer token",
    });
    expect(playwrightMocks.routeCalls).toHaveLength(1);

    const [matcher, handler] = playwrightMocks.routeCalls[0]!;
    expect(matcher(new URL("https://example.com/"))).toBe(true);
    expect(matcher(new URL("https://app.EXAMPLE.com/api"))).toBe(true);
    expect(matcher(new URL("https://api.other.dev/v1"))).toBe(true);
    expect(matcher(new URL("https://www.api.other.dev/v1"))).toBe(false);
    expect(matcher(new URL("https://notexample.com/"))).toBe(false);
    expect(matcher(new URL("https://api.third-party.cloud/v2"))).toBe(false);

    const fallback = vi.fn(async () => undefined);
    await handler({
      fallback,
      request: () => ({
        headers: () => ({ accept: "application/json" }),
        url: () => "https://app.example.com/api",
      }),
    });
    expect(fallback).toHaveBeenCalledWith({
      headers: { accept: "application/json", "X-Feature": "on" },
    });
  });

  it("resolves a named device into viewport/userAgent/isMobile/deviceScaleFactor/hasTouch", async () => {
    await createPlaywrightDriver({}, artifactsStore, {
      device: "Pixel 7",
      recordVideos: false,
    });

    expect(playwrightMocks.newContextCalls[0]).toMatchObject({
      deviceScaleFactor: 2.625,
      hasTouch: true,
      isMobile: true,
      userAgent: expect.stringContaining("Pixel 7"),
      viewport: { width: 412, height: 839 },
    });
  });

  it("passes a device descriptor object through directly", async () => {
    await createPlaywrightDriver({}, artifactsStore, {
      device: {
        deviceScaleFactor: 2,
        hasTouch: true,
        isMobile: true,
        userAgent: "custom-descriptor-ua",
        viewport: { width: 360, height: 800 },
      },
      recordVideos: false,
    });

    expect(playwrightMocks.newContextCalls[0]).toMatchObject({
      deviceScaleFactor: 2,
      hasTouch: true,
      isMobile: true,
      userAgent: "custom-descriptor-ua",
      viewport: { width: 360, height: 800 },
    });
  });

  it("ignores unrecognized fields on a device descriptor object", async () => {
    await createPlaywrightDriver({}, artifactsStore, {
      device: {
        viewport: { width: 360, height: 800 },
        // Fields real Playwright device JSON carries but that aren't emulation options.
        defaultBrowserType: "webkit",
        screen: { width: 360, height: 800 },
      } as never,
      recordVideos: false,
    });

    const options = playwrightMocks.newContextCalls[0];
    expect(options?.viewport).toEqual({ width: 360, height: 800 });
    expect(options).not.toHaveProperty("defaultBrowserType");
    expect(options).not.toHaveProperty("screen");
  });

  it("lets an explicit userAgent override a named device's userAgent", async () => {
    await createPlaywrightDriver({}, artifactsStore, {
      device: "Pixel 7",
      recordVideos: false,
      userAgent: "custom-ua",
    });

    expect(playwrightMocks.newContextCalls[0]?.userAgent).toBe("custom-ua");
    // isMobile stays device-derived — only userAgent was overridden explicitly.
    expect(playwrightMocks.newContextCalls[0]?.isMobile).toBe(true);
  });

  it("throws a clear error for an unknown device name", async () => {
    await expect(
      createPlaywrightDriver({}, artifactsStore, {
        device: "Pixle 7",
        recordVideos: false,
      }),
    ).rejects.toThrow(/Unknown device/);
  });

  it("injects no viewport-related keys when neither device nor viewport is set", async () => {
    await createPlaywrightDriver({}, artifactsStore, { recordVideos: false });

    const options = playwrightMocks.newContextCalls[0];
    expect(options).not.toHaveProperty("viewport");
    expect(options).not.toHaveProperty("isMobile");
    expect(options).not.toHaveProperty("deviceScaleFactor");
    expect(options).not.toHaveProperty("hasTouch");
  });

  it("applies device options through a persistent context profile", async () => {
    await createPlaywrightDriver({}, artifactsStore, {
      device: "Pixel 7",
      profileDir: "/tmp/profile",
      recordVideos: false,
    });

    expect(playwrightMocks.launchPersistentContextCalls[0]).toMatchObject({
      viewport: { width: 412, height: 839 },
      isMobile: true,
    });
  });
});

describe("createSeleniumDriver", () => {
  beforeEach(() => {
    mocks.builders.length = 0;
    mocks.options.length = 0;
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Env.reset();
  });

  it("reads browser version from ALUMNIUM_SELENIUM_BROWSER_VERSION", async () => {
    vi.stubEnv("ALUMNIUM_SELENIUM_BROWSER_VERSION", "stable");
    Env.reset();

    await createSeleniumDriver({}, null, {});

    expect(mocks.options[0]?.capabilities.browserVersion).toBe("stable");
  });

  it("gives an explicit browserVersion capability precedence over the env var", async () => {
    vi.stubEnv("ALUMNIUM_SELENIUM_BROWSER_VERSION", "stable");
    Env.reset();

    await createSeleniumDriver({ browserVersion: "beta" }, null, {});

    expect(mocks.options[0]?.capabilities.browserVersion).toBe("beta");
  });

  it("reads proxy from http_proxy env var automatically", async () => {
    vi.stubEnv("http_proxy", "http://envproxy.example:8080");

    await createSeleniumDriver({}, null, {});

    expect(mocks.options[0]?.args).toEqual(
      expect.arrayContaining(["--proxy-server=http://envproxy.example:8080"]),
    );
  });

  it("gives explicit proxy precedence over env var", async () => {
    vi.stubEnv("http_proxy", "http://envproxy.example:8080");

    await createSeleniumDriver({}, null, {
      proxy: { server: "http://explicit.example:3128" },
    });

    expect(mocks.options[0]?.args).toEqual(
      expect.arrayContaining(["--proxy-server=http://explicit.example:3128"]),
    );
    expect(mocks.options[0]?.args).not.toEqual(
      expect.arrayContaining(["--proxy-server=http://envproxy.example:8080"]),
    );
  });

  it("passes proxy and user agent options to Chrome", async () => {
    const driver = await createSeleniumDriver({}, null, {
      proxy: {
        server: "http://proxy.example:3128",
        bypass: ".internal,localhost",
      },
      userAgent: "Alumnium Test Agent",
    });

    expect(driver).toBe(mocks.driver as unknown as WebDriver);
    expect(mocks.options).toHaveLength(1);
    expect(mocks.options[0]?.args).toEqual(
      expect.arrayContaining([
        "--disable-logging",
        "--log-level=3",
        "--proxy-server=http://proxy.example:3128",
        "--proxy-bypass-list=.internal,localhost",
        "--user-agent=Alumnium Test Agent",
      ]),
    );
    expect(mocks.builders[0]?.chromeOptions).toBe(mocks.options[0]);
  });
});

describe("Appium capability translation", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubEnv("ALUMNIUM_DRIVER", "appium-ios");
    Env.reset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Env.reset();
  });

  async function translated(
    platform: "xcuitest" | "uiautomator2",
    capabilities: Record<string, unknown>,
    options: Parameters<typeof createMobileDriver>[3],
  ): Promise<Record<string, unknown>> {
    await createMobileDriver(platform, capabilities, null, options);
    return mobileMocks.remote.mock.calls[0]![0].capabilities as Record<
      string,
      unknown
    >;
  }

  it("sends an app reference to appium:app instead of an identifier capability", async () => {
    for (const app of [
      "/Users/me/build/TodoList.app",
      "TodoList.apk",
      "lt://APP10160422151774312193564972",
      "https://cdn.example.com/builds/app.ipa",
    ]) {
      vi.clearAllMocks();
      expect(await translated("xcuitest", {}, { app })).toEqual({
        "appium:app": app,
      });
    }
  });

  it("translates an installed app's identifier to the platform's app capability", async () => {
    expect(
      await translated("xcuitest", {}, { app: "com.example.app" }),
    ).toEqual({ "appium:bundleId": "com.example.app" });

    vi.clearAllMocks();
    expect(
      await translated("uiautomator2", {}, { app: "com.example.app" }),
    ).toEqual({ "appium:appPackage": "com.example.app" });
  });

  it("translates deviceId and appReset", async () => {
    expect(
      await translated("xcuitest", {}, { deviceId: "UDID-1", appReset: true }),
    ).toEqual({
      "appium:udid": "UDID-1",
      "appium:fullReset": true,
      "appium:noReset": false,
    });
  });

  it("translates appArguments and appEnvironment into processArguments", async () => {
    expect(
      await translated(
        "xcuitest",
        {},
        {
          appArguments: ["-UITesting"],
          appEnvironment: { API_URL: "https://staging.example.com" },
        },
      ),
    ).toEqual({
      "appium:processArguments": {
        args: ["-UITesting"],
        env: { API_URL: "https://staging.example.com" },
      },
    });
  });

  it("leaves capabilities alone when no option is given", async () => {
    expect(await translated("xcuitest", { "appium:udid": "keep" }, {})).toEqual(
      { "appium:udid": "keep" },
    );
  });

  it("lets an option override a conflicting capability", async () => {
    const capabilities = await translated(
      "xcuitest",
      { "appium:bundleId": "com.old.app" },
      { app: "com.new.app" },
    );
    expect(capabilities["appium:bundleId"]).toBe("com.new.app");
  });
});

describe("createMobileDriver", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    Env.reset();
  });

  it("drives Appium with translated capabilities by default", async () => {
    vi.stubEnv("ALUMNIUM_DRIVER", "appium-ios");
    Env.reset();

    await createMobileDriver("xcuitest", { platformName: "ios" }, null, {
      app: "com.example.app",
      deviceId: "UDID-1",
      appReset: true,
    });

    expect(mobileMocks.maestroStart).not.toHaveBeenCalled();
    expect(mobileMocks.remote).toHaveBeenCalledOnce();
    expect(mobileMocks.remote.mock.calls[0]![0].capabilities).toEqual({
      platformName: "ios",
      "appium:bundleId": "com.example.app",
      "appium:udid": "UDID-1",
      "appium:fullReset": true,
      "appium:noReset": false,
    });
  });

  it("drives Maestro from the shared options when ALUMNIUM_DRIVER=maestro", async () => {
    vi.stubEnv("ALUMNIUM_DRIVER", "maestro");
    Env.reset();

    await createMobileDriver("xcuitest", { platformName: "ios" }, null, {
      app: "com.example.app",
      deviceId: "UDID-1",
      appReset: true,
    });

    expect(mobileMocks.remote).not.toHaveBeenCalled();
    expect(mobileMocks.maestroStart).toHaveBeenCalledOnce();
    expect(mobileMocks.maestroStart.mock.calls[0]![0]).toMatchObject({
      appId: "com.example.app",
      deviceId: "UDID-1",
    });
    expect(mobileMocks.launchApp).toHaveBeenCalledWith({ clearState: true });
  });

  it("launches Maestro without clearing state unless appReset is set", async () => {
    vi.stubEnv("ALUMNIUM_DRIVER", "maestro");
    Env.reset();

    await createMobileDriver("xcuitest", {}, null, {
      app: "com.example.app",
    });

    expect(mobileMocks.maestroStart.mock.calls[0]![0]).not.toHaveProperty(
      "deviceId",
    );
    expect(mobileMocks.launchApp).toHaveBeenCalledWith({ clearState: false });
  });

  it("passes appArguments and appEnvironment to Maestro's launch", async () => {
    vi.stubEnv("ALUMNIUM_DRIVER", "maestro");
    Env.reset();

    await createMobileDriver("xcuitest", {}, null, {
      app: "com.example.app",
      appArguments: ["-UITesting"],
      appEnvironment: { API_URL: "https://staging.example.com" },
    });

    expect(mobileMocks.maestroStart.mock.calls[0]![0]).toMatchObject({
      launchArgs: ["-UITesting"],
      launchEnv: { API_URL: "https://staging.example.com" },
    });
  });

  it("passes an identifier to Maestro as its appId", async () => {
    vi.stubEnv("ALUMNIUM_DRIVER", "maestro");
    Env.reset();

    await createMobileDriver("xcuitest", {}, null, {
      app: "com.example.app",
    });

    expect(mobileMocks.maestroStart.mock.calls[0]![0]).toMatchObject({
      appId: "com.example.app",
    });
  });

  it("refuses an app reference for Maestro, which cannot install", async () => {
    vi.stubEnv("ALUMNIUM_DRIVER", "maestro");
    Env.reset();

    await expect(
      createMobileDriver("xcuitest", {}, null, {
        app: "/tmp/TodoList.app",
      }),
    ).rejects.toThrow(/cannot install/);
    expect(mobileMocks.maestroStart).not.toHaveBeenCalled();
  });

  it("requires app for Maestro", async () => {
    vi.stubEnv("ALUMNIUM_DRIVER", "maestro");
    Env.reset();

    await expect(
      createMobileDriver(
        "xcuitest",
        { "appium:bundleId": "com.example.app" },
        null,
        {},
      ),
    ).rejects.toThrow(/App must be specified/);
    expect(mobileMocks.maestroStart).not.toHaveBeenCalled();
  });
});
