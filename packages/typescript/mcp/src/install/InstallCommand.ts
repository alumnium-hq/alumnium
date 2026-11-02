import os from "node:os";
import z from "zod";
import { CliCommand, Driver, Env, Logger } from "@alumnium/core/internal";
import { ensurePlaywrightChromiumInstalled } from "../standalone/installPlaywrightBrowsers.ts";

const logger = Logger.get(import.meta.url);

export namespace InstallCommand {}

export const InstallCommand = CliCommand.define({
  name: "install",
  description: "Install browsers for a driver",

  Args: z.object({
    driver: Driver.Id.default(Env.ALUMNIUM_DRIVER).register(CliCommand.option, {
      name: "driver",
      syntax: "--driver <driver>",
      description:
        "Driver to install browsers for (defaults to ALUMNIUM_DRIVER or selenium)",
    }),
    browser: z
      .enum(["chrome", "firefox"])
      .default(Env.ALUMNIUM_SELENIUM_BROWSER)
      .register(CliCommand.option, {
        name: "browser",
        syntax: "--browser <browser>",
        description:
          "Browser to install for Selenium: chrome or firefox (defaults to ALUMNIUM_SELENIUM_BROWSER or chrome)",
      }),
  }),

  action: async ({ args }) => {
    await Logger.initEnv({ logger });

    switch (args.driver) {
      case "playwright":
        await ensurePlaywrightChromiumInstalled();
        break;
      case "selenium":
        await installSeleniumBrowser(args.browser);
        break;
      case "cloakbrowser": {
        const { ensureBinary } = await import("cloakbrowser");
        const binary = await ensureBinary();
        logger.info(`CloakBrowser installed at ${binary}`);
        break;
      }
      default:
        logger.error(
          `Driver '${args.driver}' has no installable browser, supported drivers: playwright, selenium, cloakbrowser`,
        );
        process.exit(1);
    }
  },
});

async function installSeleniumBrowser(browser: "chrome" | "firefox") {
  if (
    browser === "chrome" &&
    os.platform() === "linux" &&
    os.arch() === "arm64"
  ) {
    throw new Error(
      "Chrome for Testing provides no Linux ARM64 builds, so Selenium Manager cannot install Chrome on this platform",
    );
  }
  const {
    binaryPaths,
  }: {
    binaryPaths: (args: string[]) => {
      browserPath: string;
      driverPath: string;
    };
    // @ts-expect-error — internal path, no type declarations
  } = await import("selenium-webdriver/common/seleniumManager");
  const args = [
    "--browser",
    browser,
    "--language-binding",
    "javascript",
    "--output",
    "json",
  ];
  const browserVersion = Env.ALUMNIUM_SELENIUM_BROWSER_VERSION;
  if (browserVersion) args.push("--browser-version", browserVersion);
  const { browserPath, driverPath } = binaryPaths(args);
  if (!browserPath || !driverPath) {
    throw new Error(
      `Selenium Manager could not install ${browser} (browser: ${browserPath || "none"}, driver: ${driverPath || "none"})`,
    );
  }
  const driverName = browser === "chrome" ? "Chromedriver" : "Geckodriver";
  logger.info(
    `${browser === "chrome" ? "Chrome" : "Firefox"} installed at ${browserPath}`,
  );
  logger.info(`${driverName} installed at ${driverPath}`);
}
