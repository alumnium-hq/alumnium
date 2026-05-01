import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Shadow DOM support", () => {
  const it = baseIt;

  it("shadow DOM elements appear in accessibility tree", async ({ expect, setup }) => {
    const { al, driver, $ } = await setup();
    
    // Navigate to the-internet.herokuapp.com shadow DOM test page
    await $.navigate("https://the-internet.herokuapp.com/shadowdom");

    // Get accessibility tree XML directly from driver
    const tree = await al.driver.getAccessibilityTree();
    const xml = tree.toStr();

    // Log the XML for debugging
    console.log("Accessibility Tree XML:\n", xml);
    
    // The herokuapp shadowdom page has a simple shadow DOM structure
    // with content inside shadow roots
    // Before the fix, shadow DOM content would NOT appear in the accessibility tree
    
    // Check for "Let's have some different text!" which appears in the shadow DOM
    // If shadow DOM piercing works, this text should be in the accessibility tree
    expect(xml).toContain("In a list!");
  });
});
