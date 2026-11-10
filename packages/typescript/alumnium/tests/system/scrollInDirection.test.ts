import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Scroll In Direction", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { isMobile } = result;

      if (isMobile) skip("Not supported on mobile drivers yet");

      return result;
    };
  });

  it("scrolls up a list to load older messages", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("scrollable_list.html");
    expect(await al.get("oldest loaded message")).toContain("Message 41");
    await al.do("scroll up the messages until 'Message 1' is loaded");
    expect(await al.get("oldest loaded message")).toContain("Message 1");
  });

  it("scrolls up a list inside a frame", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("scrollable_list_frame.html");
    await al.do("scroll up the messages until 'Message 1' is loaded");
    expect(await al.get("oldest loaded message")).toContain("Message 1");
  });
});
