import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ServerXCUITestAccessibilityTree } from "./ServerXCUITestAccessibilityTree.ts";

describe(ServerXCUITestAccessibilityTree, () => {
  it("converts an XCUITest tree", async () => {
    const xml = (
      await fixtureTree("simple_xcuitest_accessibility_tree")
    ).toXml();

    expect(xml).toMatchInlineSnapshot(`
      "<Application id=1>
        <Window id=2>
          <div id=5>
            <NavigationBar name="BLTNBoard.BulletinView" id=6>
              <Button name="ToDoList" id=7 />
              <Button name="settingsIcon" id=8 />
            </NavigationBar>
            <div id=11>
              <Table id=12>
                <Cell id=13>
                  <div id=14>0</div>
                  <div id=17>All Tasks</div>
                </Cell>
                <Cell id=21>
                  <div id=22>0</div>
                  <div id=25>Today</div>
                </Cell>
                <Cell id=28>
                  <div id=29>0</div>
                  <div id=32>Tomorrow</div>
                </Cell>
                <Cell id=35>
                  <div id=36>0</div>
                  <div id=39>Next 7 Days</div>
                </Cell>
                <Cell id=42>Custom Interval</Cell>
                <Cell id=48>
                  <div id=49>0</div>
                  <div id=52>Completed</div>
                </Cell>
                <div name="Vertical scroll bar, 1 page" id=55 value="0%" />
                <div name="Horizontal scroll bar, 1 page" id=57 value="0%" />
              </Table>
              <Button id=59>Add Task</Button>
            </div>
          </div>
          <div id=66>
            <div id=68>Welcome to ToDoList</div>
            <Image name="roundedIcon" id=69 />
            <div id=70>Start with a quick onboarding</div>
            <Button id=73>
              <div id=74>Continue</div>
              <Image name="checkmark.circle" id=75 label="Selected" />
              <TextField name="maskedElement" id=76 value="Entered value" label="Enter Code" />
            </Button>
          </div>
        </Window>
      </Application>"
    `);
  });

  it("trims empty and duplicated generic wrappers", async () => {
    const tree = await fixtureTree("duplicated_xcuitest_accessibility_tree");

    expect(tree.toXml()).toMatchInlineSnapshot(`
      "<Application name="FooBar" id=1>
        <Window id=2>
          <div id=40>
            <div name="IconFooBar" id=47 />
            <div id=50>Welcome to the new FooBar app!</div>
            <div id=51>We're happy to have you!</div>
          </div>
          <div id=52>Reveal exclusive perks, save lots on stuff, and find gifts for everyone. Start acting today!</div>
          <div name="onboarding-footer-button" id=54>
            <Button name="Start Now" id=56 />
          </div>
        </Window>
      </Application>"
    `);
  });

  it("does not mutate the tree while serializing", async () => {
    const tree = await fixtureTree("duplicated_xcuitest_accessibility_tree");
    const xml = tree.toXml();

    tree.toXml(new Set(["name", "label", "value"]));

    expect(tree.toXml()).toBe(xml);
  });

  it("promotes StaticText labels while keeping value fallbacks as attributes", () => {
    const tree = new ServerXCUITestAccessibilityTree(`
      <XCUIElementTypeApplication raw_id="1">
        <XCUIElementTypeOther raw_id="2">
          <XCUIElementTypeStaticText raw_id="3" name=" " label="  Label  " value="Value"/>
          <XCUIElementTypeStaticText raw_id="4" name=" " label=" " value="  Value  "/>
          <XCUIElementTypeStaticText raw_id="5" name=" " label=" " value="      "/>
        </XCUIElementTypeOther>
      </XCUIElementTypeApplication>
    `);

    expect(tree.toXml()).toMatchInlineSnapshot(`
      "<Application id=1>
        <div id=3 value="Value">Label</div>
        <div name="Value" id=4 />
      </Application>"
    `);
  });

  it("keeps StaticText names as metadata and promotes only labels", () => {
    const tree = new ServerXCUITestAccessibilityTree(`
      <XCUIElementTypeApplication raw_id="1">
        <XCUIElementTypeStaticText raw_id="2"
          name="TrackersPreventedCount?TrackingPreventionDataExists=false"
          label="In the last seven days, Safari has prevented 0 trackers from profiling you."
          value="In the last seven days, Safari has prevented 0 trackers from profiling you."/>
        <XCUIElementTypeStaticText raw_id="3" name="InternalName" value="Visible value"/>
      </XCUIElementTypeApplication>
    `);

    expect(tree.toXml()).toMatchInlineSnapshot(`
      "<Application id=1>
        <div name="TrackersPreventedCount?TrackingPreventionDataExists=false" id=2>In the last seven days, Safari has prevented 0 trackers from profiling you.</div>
        <div name="InternalName" id=3 value="Visible value" />
      </Application>"
    `);
  });

  it("collapses matching StaticText labels into semantic parents", () => {
    const tree = new ServerXCUITestAccessibilityTree(`
      <XCUIElementTypeApplication raw_id="1">
        <XCUIElementTypeLink raw_id="2" name="Calculator" label="Calculator">
          <XCUIElementTypeStaticText raw_id="3" name="Calculator" label="Calculator" value="Calculator"/>
        </XCUIElementTypeLink>
        <XCUIElementTypeLink raw_id="4" name="Parent">
          <XCUIElementTypeStaticText raw_id="5" name="Child"/>
        </XCUIElementTypeLink>
      </XCUIElementTypeApplication>
    `);

    expect(tree.toXml()).toMatchInlineSnapshot(`
      "<Application id=1>
        <Link id=2>Calculator</Link>
        <Link name="Parent" id=4>
          <div name="Child" id=5 />
        </Link>
      </Application>"
    `);
  });

  it("keeps non-StaticText names as attributes", () => {
    const tree = new ServerXCUITestAccessibilityTree(`
      <XCUIElementTypeApplication raw_id="1">
        <XCUIElementTypeOther raw_id="2" name="CapsuleNavigationBar?isSelected=true&amp;isDistractionControlOverlayUp=false"/>
      </XCUIElementTypeApplication>
    `);

    expect(tree.toXml()).toMatchInlineSnapshot(`
      "<Application id=1>
        <div name="CapsuleNavigationBar?isSelected=true&amp;isDistractionControlOverlayUp=false" id=2 />
      </Application>"
    `);
  });

  describe("snapshots", () => {
    const fixturesPath = new URL(
      "../../../tests/unit/fixtures/tree/ios/",
      import.meta.url,
    );
    const fixtureNames = readdirSync(fixturesPath)
      .filter((name) => name.startsWith("xcuitest-") && name.endsWith(".xml"))
      .sort();

    it.for(fixtureNames)("%s", async (fixtureName) => {
      const fixtureXml = await fs.readFile(
        new URL(fixtureName, fixturesPath),
        "utf-8",
      );
      const tree = new ServerXCUITestAccessibilityTree(fixtureXml);

      await expect(tree.toXml()).toMatchFileSnapshot(
        `./__snapshots__/xcuitest/${fixtureName.replace(".xml", ".snap.xml")}`,
      );
    });
  });
});

async function fixtureTree(
  filename: string,
): Promise<ServerXCUITestAccessibilityTree> {
  const fixturePath = new URL(
    `./__fixtures__/${filename}.xml`,
    import.meta.url,
  );
  const xml = await fs.readFile(fixturePath, "utf-8");
  return new ServerXCUITestAccessibilityTree(xml);
}
