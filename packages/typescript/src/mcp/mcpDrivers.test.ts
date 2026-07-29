import type { WebDriver } from "selenium-webdriver";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { FileStore } from "../FileStore/FileStore.ts";
import { createPlaywrightDriver, createSeleniumDriver } from "./mcpDrivers.ts";

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
  function makeContext() {
    return {
      addCookies: vi.fn(async () => undefined),
      grantPermissions: vi.fn(async () => undefined),
      newPage: vi.fn(async () => ({})),
      pages: vi.fn(() => []),
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
    vi.clearAllMocks();
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
