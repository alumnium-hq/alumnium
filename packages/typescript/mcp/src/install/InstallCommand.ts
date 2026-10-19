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
    driver: Driver.Id.default(Env.ALUMNIUM_DRIVER).register(
      CliCommand.option,
      {
        name: "driver",
        syntax: "--driver <driver>",
        description:
          "Driver to install browsers for (defaults to ALUMNIUM_DRIVER or selenium)",
      },
    ),
  }),

  action: async ({ args, logFilenameHint }) => {
    Logger.path = { filename: logFilenameHint };
    await Logger.initEnv({ logger });

    switch (args.driver) {
      case "playwright":
        await ensurePlaywrightChromiumInstalled();
        break;
      case "selenium":
        await installSeleniumChrome();
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

async function installSeleniumChrome() {
  if (os.platform() === "linux" && os.arch() === "arm64") {
    throw new Error(
      "Chrome for Testing provides no Linux ARM64 builds, so Selenium Manager cannot install Chrome on this platform",
    );
  }
  const { binaryPaths }: {
    binaryPaths: (args: string[]) => {
      browserPath: string;
      driverPath: string;
    };
    // @ts-expect-error — internal path, no type declarations
  } = await import("selenium-webdriver/common/seleniumManager");
  const args = [
    "--browser",
    "chrome",
    "--language-binding",
    "javascript",
    "--output",
    "json",
  ];
  const browserVersion = Env.ALUMNIUM_SELENIUM_BROWSER_VERSION;
  if (browserVersion) args.push("--browser-version", browserVersion);
  const { browserPath, driverPath } = binaryPaths(args);
  logger.info(`Chrome installed at ${browserPath}`);
  logger.info(`Chromedriver installed at ${driverPath}`);
}
