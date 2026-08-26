import {
  type PlaywrightDriver,
  type SeleniumDriver,
  SwitchToNextTabTool,
  SwitchToPreviousTabTool,
} from "alumnium";
import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Tabs", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { isAppiumDriver } = result;

      if (isAppiumDriver)
        skip("Tabs functionality is not implemented in Appium yet");

      return result;
    };
  });

  it("switches tabs", async ({ expect, setup }) => {
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

  it("switches to a tab that opens slowly", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    const { url, slowTabUrl } = await $.serveSlowTabPage();

    await $.navigate(url);
    await al.do("click on 'Open Slow Tab' button");

    // al.get() is too slow which gives tab enough time to arrive on its own
    expect(await al.driver.url()).toBe(slowTabUrl);
    expect(await al.get("header text")).toBe("Slow Tab");
  });

  it("stays on the current tab when autoswitch is off", async ({
    expect,
    setup,
  }) => {
    const { al, $ } = await setup();
    const { url } = await $.serveSlowTabPage();
    const driver = al.driver as PlaywrightDriver | SeleniumDriver;
    driver.autoswitchToNewTab = false;

    await $.navigate(url);
    await al.do("click on 'Open Slow Tab' button");

    // Only assert once the tab is really there, otherwise nothing can be
    // picked up and the test passes even when the switch is ignored
    await $.waitForTabCount(2);

    expect(await al.get("header text")).toBe("Opener");
    expect(await al.driver.url()).toBe(url);
  });
});
