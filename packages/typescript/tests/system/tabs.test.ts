import { SwitchToNextTabTool, SwitchToPreviousTabTool } from "alumnium";
import { describe } from "vitest";
import { baseIt } from "./helpers.js";

describe("Tabs", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { driverType } = result;

      if (driverType === "appium")
        skip("Tabs functionality is not implemented in Appium yet");

      return result;
    };
  });

  it("switching tabs", async ({ expect, setup }) => {
    const { al, $ } = await setup({
      extraTools: [SwitchToNextTabTool, SwitchToPreviousTabTool],
    });

    await $.navigate("multi_tab_page.html");

    await al.do("click on 'Open New Tab' button");
    expect(await al.get("current page URL")).toBe("about:blank");

    await al.do("switch to previous browser tab");
    expect(await al.get("header text")).toBe("Multi-Tab Test Page");

    await al.do("switch to next browser tab");
    expect(await al.get("current page URL")).toBe("about:blank");

    await al.do("switch to next browser tab");
    expect(await al.get("header text")).toBe("Multi-Tab Test Page");

    await al.do("switch to previous browser tab");
    expect(await al.get("current page URL")).toBe("about:blank");
  });
});
