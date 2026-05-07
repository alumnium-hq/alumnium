import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Shadow DOM support", () => {
  const it = baseIt;

  it("shadow DOM elements appear in accessibility tree", async ({
    expect,
    setup,
  }) => {
    const { al, $ } = await setup();

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

    // Check for "In a list!" which appears in the shadow DOM
    // If shadow DOM piercing works, this text should be in the accessibility tree
    expect(xml).toContain("In a list!");
  });

  it("al.do() can click shadow DOM elements", async ({
    expect,
    setup,
  }) => {
    const { al, $ } = await setup();

    // Navigate to the-internet.herokuapp.com shadow DOM test page
    await $.navigate("https://the-internet.herokuapp.com/shadowdom");

    // Use al.do() to click on "In a list!" which is inside shadow DOM
    await al.do("click 'In a list!'");

    // If we get here without error, the click worked
    expect(true).toBe(true);
  });

  it("al.get() can retrieve text from shadow DOM elements", async ({
    expect,
    setup,
  }) => {
    const { al, $ } = await setup();

    // Navigate to the-internet.herokuapp.com shadow DOM test page
    await $.navigate("https://the-internet.herokuapp.com/shadowdom");

    // Use al.get() to retrieve text from shadow DOM
    const result = await al.get("text of the list item in shadow DOM");
    
    // The page has "In a list!" text inside shadow DOM
    expect(result).toContain("In a list!");
  });

  it("al.check() can verify shadow DOM content", async ({
    expect,
    setup,
  }) => {
    const { al, $ } = await setup();

    // Navigate to the-internet.herokuapp.com shadow DOM test page
    await $.navigate("https://the-internet.herokuapp.com/shadowdom");

    // Use al.check() to verify shadow DOM content exists
    await al.check("page contains 'In a list!'");
    
    // If we get here without error, the check passed
    expect(true).toBe(true);
  });
});
