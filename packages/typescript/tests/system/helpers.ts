import { Alumni, AppiumDriver, type Element } from "alumnium";
import { never } from "alwaysly";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import type { Locator, Page } from "playwright-core";
import { Builder, WebDriver, WebElement } from "selenium-webdriver";
import { Options } from "selenium-webdriver/chrome.js";
import { it as vitestIt } from "vitest";
import { type Browser } from "webdriverio";
import { z } from "zod";

export const DriverType = z
  .enum(["selenium", "appium", "playwright"])
  .default("selenium");

export type DriverType = z.infer<typeof DriverType>;

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
  driverType: DriverType;
}

export namespace useSetup {
  export interface Props {
    onTestFinished: typeof import("vitest").onTestFinished;
    options?: Alumni.Options | undefined;
  }
}

export async function useSetup(props: useSetup.Props): Promise<Setup> {
  const { onTestFinished } = props;

  const driverType = DriverType.parse(process.env.ALUMNIUM_DRIVER);
  const driver = await createDriver(driverType);
  const $ = createHelpers(driverType, driver);

  const options: Alumni.Options = { ...props.options };
  if (process.env.ALUMNIUM_SERVER_URL)
    options.url = process.env.ALUMNIUM_SERVER_URL;

  const al = new Alumni(driver, options);

  onTestFinished(async (ctx) => {
    const passed = ctx.task.result?.state === "pass";
    if (passed) {
      await al.cache.save();
    } else {
      await al.cache.discard();
    }

    await al.quit();
  });

  return { driver, driverType, al, $ };
}

async function createDriver(driverType: DriverType): Promise<Alumni.Driver> {
  switch (driverType) {
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

    case "appium": {
      const { browser } = await import("@wdio/globals");
      const driver = browser as Browser;
      (driver as unknown as AppiumDriver).delay = 0.1;
      return driver;
    }

    case "playwright": {
      const browser = await chromium.launch({
        headless: process.env.ALUMNIUM_PLAYWRIGHT_HEADLESS !== "false",
      });
      const context = await browser.newContext();
      const page = await context.newPage();
      return page;
    }

    default:
      never();
  }
}

function createHelpers(
  driverType: DriverType,
  driver: Alumni.Driver,
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
      switch (driverType) {
        case "appium":
          await (driver as Browser).url($.resolveUrl(url));
          return;

        case "selenium":
          await (driver as WebDriver).get($.resolveUrl(url));
          return;

        case "playwright":
          await (driver as Page).goto($.resolveUrl(url));
          return;

        default:
          driverType satisfies never;
      }
    },

    async type(element: Element | undefined, text: string) {
      switch (driverType) {
        case "appium":
          return (element as WebdriverIO.Element).setValue(text);

        case "selenium":
          return (element as WebElement).sendKeys(text);

        case "playwright":
          return (element as Locator).fill(text);

        default:
          driverType satisfies never;
      }
    },

    async click(element: Element | undefined) {
      switch (driverType) {
        case "appium":
          return (element as WebdriverIO.Element).click();

        case "selenium":
          return (element as WebElement).click();

        case "playwright":
          return (element as Locator).click();

        default:
          driverType satisfies never;
      }
    },
  };
  return $;
}

export const it = vitestIt.extend("setup", async ({ onTestFinished }) => {
  return (options?: Alumni.Options) => useSetup({ onTestFinished, options });
});

export const baseIt = it;
