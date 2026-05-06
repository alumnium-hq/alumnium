export namespace DriverId {
  export interface Selenium {
    kind: "selenium";
  }

  export interface Playwright {
    kind: "playwright";
  }

  export type Appium = "appium";
}
export type DriverId =
  | DriverId.Selenium
  | DriverId.Playwright
  | DriverId.Appium;
