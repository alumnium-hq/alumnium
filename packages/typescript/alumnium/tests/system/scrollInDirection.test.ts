import { describe } from "vitest";
import { type Alumni, ScrollInDirectionTool } from "alumnium";
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

  async function firstVisibleMessage(al: Alumni): Promise<number> {
    const value = await al.get("number of the first visible message");
    return Number(String(value).match(/\d+/)?.[0]);
  }

  it("scrolls a list up and down", async ({ expect, setup }) => {
    const { al, $ } = await setup({
      extraTools: [ScrollInDirectionTool],
    });

    await $.navigate("scrollable_list.html");
    const initial = await firstVisibleMessage(al);
    await al.do("scroll up the messages");
    const scrolledUp = await firstVisibleMessage(al);
    expect(scrolledUp).toBeLessThan(initial);
    await al.do("scroll down the messages");
    expect(await firstVisibleMessage(al)).toBeGreaterThan(scrolledUp);
  });

  it("scrolls a list inside a frame", async ({ expect, setup }) => {
    const { al, $ } = await setup({
      extraTools: [ScrollInDirectionTool],
    });

    await $.navigate("scrollable_list_frame.html");
    const initial = await firstVisibleMessage(al);
    await al.do("scroll up the messages");
    expect(await firstVisibleMessage(al)).toBeLessThan(initial);
  });
});
