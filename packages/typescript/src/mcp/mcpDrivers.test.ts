import type { WebDriver } from "selenium-webdriver";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createSeleniumDriver } from "./mcpDrivers.ts";

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
