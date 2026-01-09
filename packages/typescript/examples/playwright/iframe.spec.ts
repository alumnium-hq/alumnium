import { expect, test } from "./index.js";

test.describe("Nested Frames", () => {
  test("elements inside nested iframes can be accessed transparently", async ({
    page,
    al,
  }) => {
    // The nested_frames page has:
    // - A top frame containing LEFT, MIDDLE, RIGHT text
    // - A bottom frame containing BOTTOM text
    await page.goto("https://the-internet.herokuapp.com/nested_frames");

    const middleText = await al.get("text that says MIDDLE");
    expect(middleText).toBe("MIDDLE");

    const bottomText = await al.get("text that says BOTTOM");
    expect(bottomText).toBe("BOTTOM");

    const leftText = await al.get("text that says LEFT");
    expect(leftText).toBe("LEFT");

    const rightText = await al.get("text that says RIGHT");
    expect(rightText).toBe("RIGHT");
  });
});
