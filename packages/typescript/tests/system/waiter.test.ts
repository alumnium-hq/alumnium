import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Waiter script", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { driverType } = result;

      if (driverType === "appium-ios")
        skip("Synchronization is not implemented in Appium yet");

      return result;
    };
  });

  // TODO: Figure out why this test it so flaky on CI and fix it.
  it.skip("waiting for loading content", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://the-internet.herokuapp.com/dynamic_content");
    const totalImages = await al.get("the total number of profile images");
    expect(totalImages).toBe(3);
  });

  it("waiting for requests and form updates", async ({ setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://the-internet.herokuapp.com/forgot_password");
    await al.do("type test@example.com in the email field");
    await al.do("click Retrieve password button");
    await al.check("should see Internal Server Error");
  });
});
