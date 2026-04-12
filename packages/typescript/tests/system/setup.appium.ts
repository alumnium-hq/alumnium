import type { TestProject } from "vitest/node";
import { remote } from "webdriverio";
import { Model } from "alumnium";

declare module "vitest" {
  export interface ProvidedContext {
    wdioSessionId: string;
    wdioSessionCapabilities: WebdriverIO.Capabilities;
  }
}

export async function setup(project: TestProject) {
  const browser = await remote({
    capabilities: {
      platformName: "iOS",
      browserName: "Safari",
      "appium:automationName": "XCUITest",
      "appium:deviceName": "iPhone 16",
      "appium:platformVersion": "18",
      "appium:noReset": true,
      "lt:options": {
        build: "TypeScript - iOS",
        name: `Vitest (${Model.current.provider}/${Model.current.name}) `,
        isRealMobile: true,
        network: false,
        visual: true,
        video: true,
        w3c: true,
      },
    },
    hostname: "mobile-hub.lambdatest.com",
    path: "/wd/hub",
    port: 80,
    logLevel: "warn",
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
    ...(process.env.LT_USERNAME && { user: process.env.LT_USERNAME }),
    ...(process.env.LT_ACCESS_KEY && { key: process.env.LT_ACCESS_KEY }),
  });

  project.provide("wdioSessionId", browser.sessionId);
  project.provide(
    "wdioSessionCapabilities",
    browser.capabilities as WebdriverIO.Capabilities,
  );

  return async function teardown() {
    await browser.deleteSession();
  };
}
