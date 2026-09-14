import {
  Alumni,
  AppiumDriver,
  MaestroDriver,
  MaestroSession,
  Model,
  type Element,
} from "alumnium";
import { never } from "alwaysly";
import { createServer, type RequestListener } from "node:http";
import type { AddressInfo } from "node:net";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";
import type { Locator, Page } from "playwright-core";
import { Builder, WebElement, type WebDriver } from "selenium-webdriver";
import { Options } from "selenium-webdriver/chrome.js";
import { inject, it as vitestIt } from "vitest";
import { attach, type Browser } from "webdriverio";
import { Driver } from "../../src/drivers/Driver.ts";
import { Env } from "../../src/Env.ts";
import { sleep } from "../../src/utils/timers.ts";

const localTargetPage: RequestListener = (_request, response) => {
  response.writeHead(200, { "content-type": "text/html" });
  response.end("<title>Local Target</title><h1>Local Target</h1>");
};

export namespace Setup {
  export interface Helpers {
    resolveUrl: (url: string) => string;
    navigate: (url: string) => Promise<void>;
    type: (element: Element | undefined, text: string) => Promise<void>;
    click: (element: Element | undefined) => Promise<void>;
    serve: (handler?: RequestListener) => Promise<Setup.LocalServer>;
    serveSlowTabPage: () => Promise<Setup.SlowTabPage>;
    waitForTabCount: (count: number) => Promise<void>;
  }

  export interface LocalServer {
    url: string;
  }

  export interface SlowTabPage {
    url: string;
    slowTabUrl: string;
  }
}

export interface Setup {
  driver: Alumni.Driver;
  al: Alumni;
  $: Setup.Helpers;
  driverId: Driver.Id;
  isMobile: boolean;
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

  const dirname = path.dirname(fileURLToPath(import.meta.url));

  const options: Alumni.Options = {
    ...props.options,
    url: Env.ALUMNIUM_SERVER_URL,
    navigationPolicy: {
      ...props.options?.navigationPolicy,
      allowedFilePaths: [
        path.resolve(dirname, "../../../python/examples/support/pages"),
      ],
    },
  };

  const al = new Alumni(driver, options);
  const $ = createHelpers(driverId, driver, al, onTestFinished);

  if (Driver.isAppium(driverId)) {
    (al.driver as AppiumDriver).delay = 0.1;
  }

  if (Driver.isMaestro(driverId)) {
    const maestroDriver = al.driver as MaestroDriver;
    const isAndroid = inject("maestroOs") === "android";
    maestroDriver.delay = isAndroid ? 2 : 0.5;
    // The soft keyboard covers the To-Do app's save button, so drop it after typing. The driver
    // only sends the (Back-press based) hide when a keyboard is really on screen.
    maestroDriver.hideKeyboardAfterTyping = isAndroid;
  }

  const model = await al.model();
  const isMobile = Driver.isMobile(driverId);

  onTestFinished(async (ctx) => {
    const passed = ctx.task.result?.state === "pass";
    if (passed) {
      await al.cache.save();
    } else {
      await al.cache.discard();
    }

    await al.quit();
  });

  return { driver, driverId, isMobile, al, $, model };
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
      const browserVersion = Env.ALUMNIUM_SELENIUM_BROWSER_VERSION;
      if (browserVersion) options.setBrowserVersion(browserVersion);
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

    case "maestro": {
      const session = await MaestroSession.start({
        appId: inject("maestroAppId"),
        deviceId: inject("maestroDeviceId"),
      });
      await session.launchApp({ clearState: true });
      return session;
    }

    default:
      never();
  }
}

function createHelpers(
  driverId: Driver.Id,
  driver: Alumni.Driver,
  al: Alumni,
  onTestFinished: useSetup.Props["onTestFinished"],
): Setup.Helpers {
  async function tabCount(): Promise<number> {
    switch (driverId) {
      case "selenium":
        return (await (driver as WebDriver).getAllWindowHandles()).length;

      case "playwright":
        return (driver as Page).context().pages().length;

      case "appium-ios":
      case "appium-android":
        throw new Error("Tabs are not implemented in Appium yet");

      default:
        never();
    }
  }

  const $: Setup.Helpers = {
    resolveUrl(url: string): string {
      if (URL.canParse(url)) {
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

    async serve(handler: RequestListener = localTargetPage) {
      const server = createServer(handler);
      await new Promise<void>((resolve) =>
        server.listen(0, "127.0.0.1", resolve),
      );
      onTestFinished(() => {
        server.closeAllConnections();
        server.close();
      });

      const { port } = server.address() as AddressInfo;
      return { url: `http://127.0.0.1:${port}/` };
    },

    async serveSlowTabPage() {
      const { url } = await $.serve((request, response) => {
        const isSlowTab = request.url === "/slow-tab";
        const send = () => {
          response.writeHead(200, {
            "content-type": "text/html",
            "cache-control": "no-store",
          });
          response.end(
            isSlowTab
              ? "<title>Slow Tab</title><h1>Slow Tab</h1>"
              : `<title>Opener</title><h1>Opener</h1>
                 <button onclick="window.open('/slow-tab', '_blank')">Open Slow Tab</button>`,
          );
        };

        if (isSlowTab) setTimeout(send, 2000);
        else send();
      });

      return { url, slowTabUrl: `${url}slow-tab` };
    },

    async waitForTabCount(count: number) {
      const deadline = Date.now() + 10_000;
      while ((await tabCount()) < count) {
        if (Date.now() > deadline) {
          throw new Error(`Timed out waiting for ${count} tabs to open`);
        }
        await sleep(50);
      }
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

        case "maestro":
          throw new Error("Maestro has no element handles");

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

        case "maestro":
          throw new Error("Maestro has no element handles");

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
