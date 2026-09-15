import { describe, expect, it } from "vitest";
import { TreeFactory } from "./TreeFactory.ts";

describe("TreeFactory.kindFor", () => {
  it("gives every browser driver the chromium tree", () => {
    expect(TreeFactory.kindFor("chromium", "selenium")).toBe("chromium");
    expect(TreeFactory.kindFor("chromium", "playwright")).toBe("chromium");
  });

  it("picks the Appium tree by mobile OS", () => {
    expect(TreeFactory.kindFor("ios", "appium")).toBe("xcuitest");
    expect(TreeFactory.kindFor("android", "appium")).toBe("uiautomator2");
  });

  it("uses the Maestro tree on either OS when Maestro drives it", () => {
    expect(TreeFactory.kindFor("ios", "maestro")).toBe("maestro");
    expect(TreeFactory.kindFor("android", "maestro")).toBe("maestro");
  });
});
