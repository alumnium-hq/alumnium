export const config: WebdriverIO.Config = {
  runner: "local",
  tsConfigPath: "./tsconfig.json",
  specs: ["./examples/mocha/**/*.ts"],
  framework: "mocha",
  injectGlobals: false,
  mochaOpts: {
    ui: "bdd",
    timeout: 300000, // 5 minutes
    require: ["examples/mocha/helpers.ts"],
  },
  maxInstances: 1,
  reporters: ["spec"],
  capabilities: [
    {
      platformName: "iOS",
      browserName: "Safari",
      "appium:automationName": "XCUITest",
      "appium:deviceName": "iPhone 16",
      "appium:platformVersion": "18",
      "appium:noReset": true,
      "lt:options": {
        build: "TypeScript - iOS",
        isRealMobile: true,
        network: false,
        visual: true,
        video: true,
        w3c: true,
      },
    },
  ],
  waitforTimeout: 10000,
  connectionRetryTimeout: 120000,
  connectionRetryCount: 3,
  logLevel: "warn",
  // LambdaTest
  hostname: "mobile-hub.lambdatest.com",
  path: "/wd/hub",
  port: 80,
  services: ["lambdatest"],
  key: process.env.LT_ACCESS_KEY,
  user: process.env.LT_USERNAME,
  // @ts-expect-error wdio-lambdatest-service types are missing
  product: "appAutomation",
};
