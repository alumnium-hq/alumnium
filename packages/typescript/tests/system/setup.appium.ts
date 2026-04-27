import type { TestProject } from "vitest/node";
import { remote } from "webdriverio";
import { Model } from "alumnium";

interface WdioRemoteOptions {
  hostname: string;
  path: string;
  port: number;
  user?: string;
  key?: string;
}

declare module "vitest" {
  export interface ProvidedContext {
    wdioSessionId: string;
    wdioSessionCapabilities: WebdriverIO.Capabilities;
    wdioRemoteOptions: WdioRemoteOptions;
  }
}

export async function setup(project: TestProject) {
  const useLambdaTest = !!(
    process.env.LT_USERNAME && process.env.LT_ACCESS_KEY
  );

  const capabilities: WebdriverIO.Capabilities = useLambdaTest
    ? {
        platformName: "iOS",
        browserName: "Safari",
        "appium:automationName": "XCUITest",
        "appium:deviceName": "iPhone 16",
        "appium:platformVersion": "18",
        "appium:noReset": true,
        "lt:options": {
          build: "TypeScript - iOS",
          name: `Vitest (${Model.current.provider}/${Model.current.name})`,
          isRealMobile: true,
          network: false,
          visual: true,
          video: true,
          w3c: true,
        },
      }
    : {
        platformName: "iOS",
        "appium:automationName": "XCUITest",
        "appium:deviceName": "iPhone 16",
        "appium:platformVersion": "18.5",
        "appium:bundleId": "com.apple.mobilesafari",
        "appium:noReset": true,
        "appium:newCommandTimeout": 300,
      };

  const remoteOptions: WdioRemoteOptions = useLambdaTest
    ? {
        hostname: "mobile-hub.lambdatest.com",
        path: "/wd/hub",
        port: 80,
        ...(process.env.LT_USERNAME && { user: process.env.LT_USERNAME }),
        ...(process.env.LT_ACCESS_KEY && { key: process.env.LT_ACCESS_KEY }),
      }
    : {
        hostname: "localhost",
        path: "/",
        port: 4723,
      };

  const browser = await remote({
    capabilities,
    ...remoteOptions,
    logLevel: "warn",
    connectionRetryTimeout: 120000,
    connectionRetryCount: 3,
  });

  project.provide("wdioSessionId", browser.sessionId);
  project.provide(
    "wdioSessionCapabilities",
    browser.capabilities as WebdriverIO.Capabilities,
  );
  project.provide("wdioRemoteOptions", remoteOptions);

  return async function teardown() {
    await browser.deleteSession();
  };
}
