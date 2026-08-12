import { Alumni, AppiumDriver, Model, type Element } from "alumnium";
import { never } from "alwaysly";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import type { Locator } from "playwright-core";
import { Builder, WebElement } from "selenium-webdriver";
import { Options } from "selenium-webdriver/chrome.js";
import { afterAll, inject, it as vitestIt } from "vitest";
import { attach, type Browser } from "webdriverio";
import { Driver } from "../../src/drivers/Driver.ts";
import { Env } from "../../src/Env.ts";
import { Tracer } from "../../src/telemetry/Tracer.ts";

// Make sure to flush the telemetry data after all tests are done.
afterAll(() => {
  return Tracer.flush();
});

export namespace Setup {
  export interface Helpers {
    resolveUrl: (url: string) => string;
    navigate: (url: string) => Promise<void>;
    type: (element: Element | undefined, text: string) => Promise<void>;
    click: (element: Element | undefined) => Promise<void>;
  }
}

export interface Setup {
  driver: Alumni.Driver;
  al: Alumni;
  $: Setup.Helpers;
  driverId: Driver.Id;
  isAppiumDriver: boolean;
  model: Model;
}

export namespace useSetup {
  export interface Props {
    onTestFinished: typeof import("vitest").onTestFinished;
    options?: Alumni.Options | undefined;
  }
}

export async function useSetup(props: useSetup.Props): Promise<Setup> {
  const { onTestFinished } = props;

  const driverId = Env.ALUMNIUM_DRIVER;
  const driver = await createDriver(driverId);
  const isAppiumDriver = Driver.isAppium(driverId);

  const options: Alumni.Options = {
    ...props.options,
    url: Env.ALUMNIUM_SERVER_URL,
  };

  const al = new Alumni(driver, options);
  const $ = createHelpers(driverId, driver, al);

  if (isAppiumDriver) {
    (al.driver as AppiumDriver).delay = 0.1;
  }

  const model = await al.model();

  onTestFinished(async (ctx) => {
    const passed = ctx.task.result?.state === "pass";
    if (passed) {
      await al.cache.save();
    } else {
      await al.cache.discard();
    }

    await al.quit();
  });

  return { driver, driverId, isAppiumDriver, al, $, model };
}

async function createDriver(driverId: Driver.Id): Promise<Alumni.Driver> {
  switch (driverId) {
    case "selenium": {
      const options = new Options();
      options.addArguments("--disable-blink-features=AutomationControlled");
      options.setUserPreferences({
        credentials_enable_service: false,
        profile: {
          password_manager_enabled: false,
          password_manager_leak_detection: false,
        },
      });
      return new Builder()
        .forBrowser("chrome")
        .setChromeOptions(options)
        .build();
    }

    case "playwright": {
      const browser = await chromium.launch({
        headless: Env.ALUMNIUM_PLAYWRIGHT_HEADLESS,
      });
      const context = await browser.newContext();
      const page = await context.newPage();
      return page;
    }

    case "appium-ios": {
      const sessionId = inject("wdioSessionId");
      const capabilities = inject("wdioSessionCapabilities");
      const remoteOptions = inject("wdioRemoteOptions");
      const driver = (await attach({
        sessionId,
        capabilities,
        ...remoteOptions,
        logLevel: "warn",
      })) as Browser;
      return driver;
    }

    case "appium-android": {
      throw new Error("Unimplemented");
    }

    default:
      never();
  }
}

function createHelpers(
  driverId: Driver.Id,
  driver: Alumni.Driver,
  al: Alumni,
): Setup.Helpers {
  const $: Setup.Helpers = {
    resolveUrl(url: string): string {
      if (url.startsWith("http")) {
        return url;
      } else {
        const dirname = path.dirname(fileURLToPath(import.meta.url));
        return (
          "file://" +
          path.resolve(
            path.join(dirname, `../../../python/examples/support/pages`, url),
          )
        );
      }
    },

    async navigate(url: string) {
      await al.driver.visit($.resolveUrl(url));
    },

    async type(element: Element | undefined, text: string) {
      switch (driverId) {
        case "selenium":
          return (element as WebElement).sendKeys(text);

        case "playwright":
          return (element as Locator).fill(text);

        case "appium-ios":
        case "appium-android":
          return (element as WebdriverIO.Element).setValue(text);

        default:
          driverId satisfies never;
      }
    },

    async click(element: Element | undefined) {
      switch (driverId) {
        case "selenium":
          return (element as WebElement).click();

        case "playwright":
          return (element as Locator).click();

        case "appium-ios":
        case "appium-android":
          return (element as WebdriverIO.Element).click();

        default:
          driverId satisfies never;
      }
    },
  };
  return $;
}

export const it = vitestIt.extend("setup", async ({ onTestFinished }) => {
  return (options?: Alumni.Options) => useSetup({ onTestFinished, options });
});

export const baseIt = it;
