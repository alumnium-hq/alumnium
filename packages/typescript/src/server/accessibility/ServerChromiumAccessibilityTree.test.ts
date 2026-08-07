import fs from "node:fs/promises";
import { readdirSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { ChromiumAccessibilityTree as ClientChromiumAccessibilityTree } from "../../accessibility/ChromiumAccessibilityTree.ts";
import { ServerChromiumAccessibilityTree } from "./ServerChromiumAccessibilityTree.ts";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { lit } from "smollit";

describe(ServerChromiumAccessibilityTree, () => {
  describe("toXml", () => {
    it("toXml converts tree to expected XML", async () => {
      const tree = await basicChromiumTree();

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<RootWebArea name="TodoMVC: React" id=1>
          <div id=4>
            <div id=5>
              <heading id=6 level=1>todos</heading>
              <div id=8>
                <textbox name="New Todo Input" id=9 editable="plaintext">
                  <div id=11 editable="plaintext"/>
                </textbox>
                <LabelText id=12>New Todo Input</LabelText>
              </div>
            </div>
            <main id=14>
              <div id=15>
                <checkbox id=16/>
                <LabelText id=17>
                  <div id=19>\\u276f</div>
                  <div id=20>Toggle All Input</div>
                </LabelText>
              </div>
              <list id=21>
                <listitem id=22 level=1>
                  <checkbox id=24/>
                  <LabelText id=25>hello</LabelText>
                </listitem>
                <listitem id=27 level=1>
                  <checkbox id=29/>
                  <LabelText id=30>he</LabelText>
                </listitem>
              </list>
            </main>
            <div id=32>
              1 item left!
              <list id=35>
                <listitem id=36 level=1>
                  <link id=37>All</link>
                </listitem>
                <listitem id=39 level=1>
                  <link id=40>Active</link>
                </listitem>
                <listitem id=42 level=1>
                  <link id=43>Completed</link>
                </listitem>
              </list>
              <button id=45>Clear completed</button>
            </div>
          </div>
          <contentinfo id=47>
            <paragraph id=48>Double-click to edit a todo</paragraph>
            <paragraph id=50>Created by the TodoMVC Team</paragraph>
            <paragraph id=52>
              Part of
              <link id=54>TodoMVC</link>
            </paragraph>
          </contentinfo>
        </RootWebArea>"
      `);
    });

    it("toXml supports excluding attributes", async () => {
      const tree = await basicChromiumTree();
      const xml = tree.toXml(new Set(["id", "focusable"]));

      expect(xml.includes(" id=")).toBe(false);
      expect(xml.includes(" focusable=")).toBe(false);
    });

    it("preserves adjacent text sibling boundaries", () => {
      const rawXml = lit`
        <group raw_id="801" ignored="false" name="">
          <none raw_id="802" ignored="true">
            <link raw_id="803" ignored="false" name="Tama's Little Music Shop" focusable="true" url="https://www.youtube.com/@tamamusic">
              <StaticText raw_id="804" ignored="false" name="Tama's Little Music Shop"/>
            </link>
          </none>
          <none raw_id="806" ignored="true">
            <StaticText raw_id="807" ignored="false" name="1.2K views"/>
          </none>
          <generic raw_id="809" ignored="false" name="10 months ago">
            <StaticText raw_id="810" ignored="false" name="10 months ago"/>
          </generic>
        </group>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<group id=1>
          <link id=3 focusable url="https://www.youtube.com/@tamamusic">Tama's Little Music Shop</link>
          1.2K views
          <div id=7>10 months ago</div>
        </group>"
      `);
    });

    it("inlines StaticText and ignores fragmented InlineTextBox children", () => {
      const rawXml = lit`
        <link raw_id="7" ignored="false" name="Skip to content" focusable="true" url="https://github.com/alumnium-hq/alumnium/pull/256#start-of-content">
          <StaticText raw_id="8" ignored="false" name="Skip to content">
            <InlineTextBox raw_id="9" ignored="false" name="S"/>
            <InlineTextBox raw_id="10" ignored="false" name="k"/>
            <InlineTextBox raw_id="11" ignored="false" name="ip "/>
            <InlineTextBox raw_id="12" ignored="false" name="to content"/>
          </StaticText>
        </link>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(
        `"<link id=1 focusable url="https://github.com/alumnium-hq/alumnium/pull/256#start-of-content">Skip to content</link>"`,
      );
    });

    it("trims names and whitespace-only generic nodes", () => {
      const rawXml = lit`
        <generic raw_id="1" ignored="false" name="">
          <generic raw_id="2" ignored="false" name="  Dark Mode  "/>
          <generic raw_id="3" ignored="false" name="      "/>
          <link raw_id="4" ignored="false" name="  Calculator  "/>
        </generic>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<div id=1>
          <div name="Dark Mode" id=2/>
          <link name="Calculator" id=4/>
        </div>"
      `);
    });

    it("removes empty generic live regions", () => {
      const rawXml = lit`
        <group raw_id="1" ignored="false" name="">
          <generic raw_id="2" ignored="false" name="" live="polite" atomic="true" relevant="additions text"/>
          <generic raw_id="3" ignored="false" name="" live="assertive" atomic="true" relevant="additions text"/>
          <generic raw_id="4" ignored="false" name="Update" live="polite" atomic="true" relevant="additions text"/>
          <generic raw_id="5" ignored="false" name="" live="polite" focusable="true"/>
          <alert raw_id="6" ignored="false" name="" live="assertive" atomic="true" relevant="additions text"/>
        </group>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<group id=1>
          <div name="Update" id=4 live="polite" atomic relevant="additions text"/>
          <div id=5 live="polite" focusable/>
          <alert id=6 live="assertive" atomic relevant="additions text"/>
        </group>"
      `);
    });

    it("unwraps an only generic child with multiple children", () => {
      const rawXml = lit`
        <listitem raw_id="1" ignored="false" name="" level="1">
          <generic raw_id="2" ignored="false" name="">
            <button raw_id="3" ignored="false" name="API &amp; IaC" focusable="true"/>
            <list raw_id="4" ignored="false" name=""/>
          </generic>
        </listitem>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<listitem id=1 level=1>
          <button name="API &amp; IaC" id=3 focusable/>
          <list id=4/>
        </listitem>"
      `);
    });

    it("preserves generic wrappers around mixed text and element children", () => {
      const rawXml = lit`
        <contentinfo raw_id="1" ignored="false" name="">
          <generic raw_id="2" ignored="false" name="">
            <StaticText raw_id="3" ignored="false" name="Copyright © 2021-2026 "/>
            <link raw_id="4" ignored="false" name="Boni García" focusable="true" url="https://bonigarcia.dev/">
              <StaticText raw_id="5" ignored="false" name="Boni García"/>
            </link>
          </generic>
        </contentinfo>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<contentinfo id=1>
          <div id=2>
            Copyright © 2021-2026
            <link id=4 focusable url="https://bonigarcia.dev/">Boni García</link>
          </div>
        </contentinfo>"
      `);
    });

    it("removes wrappers retained only by empty generic siblings", () => {
      const rawXml = lit`
        <none raw_id="1" ignored="true">
          <none raw_id="2" ignored="true">
            <StaticText raw_id="3" ignored="false" name="Footer section"/>
          </none>
          <generic raw_id="4" ignored="false" name="">
            <none raw_id="5" ignored="true">
              <none raw_id="6" ignored="true">
                <generic raw_id="7" ignored="false" name="">
                  <generic raw_id="8" ignored="false" name="">
                    <StaticText raw_id="9" ignored="false" name="© 2026 Airbnb, Inc."/>
                  </generic>
                  <generic raw_id="10" ignored="false" name="">
                    <generic raw_id="11" ignored="false" name=""/>
                    <generic raw_id="12" ignored="false" name="">
                      <list raw_id="13" ignored="false" name=""/>
                    </generic>
                  </generic>
                </generic>
              </none>
            </none>
          </generic>
        </none>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<div id=1>
          Footer section
          <div id=7>
            © 2026 Airbnb, Inc.
            <list id=13/>
          </div>
        </div>"
      `);
    });

    it("preserves generic wrappers alongside siblings", () => {
      const rawXml = lit`
        <group raw_id="1" ignored="false" name="">
          <generic raw_id="2" ignored="false" name="">
            <button raw_id="3" ignored="false" name="First"/>
            <button raw_id="4" ignored="false" name="Second"/>
          </generic>
          <button raw_id="5" ignored="false" name="Sibling"/>
        </group>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      expect(tree.toXml()).toMatchInlineSnapshot(`
        "<group id=1>
          <div id=2>
            <button name="First" id=3/>
            <button name="Second" id=4/>
          </div>
          <button name="Sibling" id=5/>
        </group>"
      `);
    });

    it("trims tree", async () => {
      const rawXml = lit`
        <RootWebArea raw_id="1" backendDOMNodeId="1" nodeId="1" ignored="false" name="YouTube" focusable="true" url="https://www.youtube.com/">
          <none raw_id="2" backendDOMNodeId="120" nodeId="120" ignored="true">
            <generic raw_id="3" backendDOMNodeId="16" nodeId="16" ignored="false" name="">
              <generic raw_id="4" backendDOMNodeId="2" nodeId="2" ignored="false" name="">
                <generic raw_id="5" backendDOMNodeId="847" nodeId="847" ignored="false" name=""/>
                <generic raw_id="6" backendDOMNodeId="868" nodeId="868" ignored="false" name="">
                  <generic raw_id="7" backendDOMNodeId="17" nodeId="17" ignored="false" name="">
                    <banner raw_id="8" backendDOMNodeId="18" nodeId="18" ignored="false" name="">
                      <generic raw_id="9" backendDOMNodeId="871" nodeId="871" ignored="false" name=""/>
                      <generic raw_id="10" backendDOMNodeId="872" nodeId="872" ignored="false" name=""/>
                      <generic raw_id="11" backendDOMNodeId="873" nodeId="873" ignored="false" name=""/>
                      <generic raw_id="12" backendDOMNodeId="874" nodeId="874" ignored="false" name="">
                        <generic raw_id="13" backendDOMNodeId="10" nodeId="10" ignored="false" name="">
                          <generic raw_id="14" backendDOMNodeId="882" nodeId="882" ignored="false" name="">
                            <button raw_id="15" backendDOMNodeId="19" nodeId="19" ignored="false" name="Guide" invalid="false" focusable="true" pressed="true">
                              <generic raw_id="16" backendDOMNodeId="883" nodeId="883" ignored="false" name="">
                                <none raw_id="17" backendDOMNodeId="884" nodeId="884" ignored="true">
                                  <none raw_id="18" backendDOMNodeId="885" nodeId="885" ignored="true"/>
                                </none>
                              </generic>
                            </button>
                            <generic raw_id="19" backendDOMNodeId="887" nodeId="887" ignored="false" name="">
                              <generic raw_id="20" backendDOMNodeId="888" nodeId="888" ignored="false" name=""/>
                              <generic raw_id="21" backendDOMNodeId="889" nodeId="889" ignored="false" name=""/>
                            </generic>
                          </generic>
                          <generic raw_id="22" backendDOMNodeId="11" nodeId="11" ignored="false" name="">
                            <link raw_id="23" backendDOMNodeId="21" nodeId="21" ignored="false" name="YouTube Home" focusable="true" url="https://www.youtube.com/">
                              <generic raw_id="24" backendDOMNodeId="890" nodeId="890" ignored="false" name="">
                                <generic raw_id="25" backendDOMNodeId="892" nodeId="892" ignored="false" name="">
                                  <none raw_id="26" backendDOMNodeId="893" nodeId="893" ignored="true">
                                    <none raw_id="27" backendDOMNodeId="894" nodeId="894" ignored="true"/>
                                  </none>
                                </generic>
                              </generic>
                            </link>
                            <generic raw_id="28" backendDOMNodeId="930" nodeId="930" ignored="false" name="">
                              <StaticText raw_id="29" backendDOMNodeId="23" nodeId="23" ignored="false" name="SG">
                                <InlineTextBox raw_id="30" nodeId="-1000000002" ignored="false" name="SG"/>
                              </StaticText>
                            </generic>
                          </generic>
                          <generic raw_id="31" backendDOMNodeId="931" nodeId="931" ignored="false" name="">
                            <generic raw_id="32" backendDOMNodeId="932" nodeId="932" ignored="false" name="">
                              <none raw_id="33" backendDOMNodeId="933" nodeId="933" ignored="true">
                                <button raw_id="34" backendDOMNodeId="24" nodeId="24" ignored="false" name="Skip navigation" invalid="false" focusable="true">
                                  <generic raw_id="35" backendDOMNodeId="934" nodeId="934" ignored="false" name="">
                                    <StaticText raw_id="36" backendDOMNodeId="25" nodeId="25" ignored="false" name="Skip navigation">
                                      <InlineTextBox raw_id="37" nodeId="-1000000003" ignored="false" name="Skip navigation"/>
                                    </StaticText>
                                  </generic>
                                  <none raw_id="38" backendDOMNodeId="939" nodeId="939" ignored="true"/>
                                </button>
                              </none>
                              <generic raw_id="39" backendDOMNodeId="941" nodeId="941" ignored="false" name=""/>
                            </generic>
                          </generic>
                        </generic>
                      </generic>
                    </banner>
                  </generic>
                </generic>
            </generic>
          </none>
        </RootWebArea>
      `;
      const tree = new ServerChromiumAccessibilityTree(rawXml);

      const xml = tree.toXml();
      expect(xml).toMatchInlineSnapshot(`
        "<RootWebArea name="YouTube" id=1 focusable url="https://www.youtube.com/">
          <banner id=8>
            <button name="Guide" id=15 focusable pressed/>
            <div id=22>
              <link name="YouTube Home" id=23 focusable url="https://www.youtube.com/"/>
              SG
            </div>
            <button id=34 focusable>Skip navigation</button>
          </banner>
        </RootWebArea>"
      `);
    });
  });

  describe("snapshots", () => {
    const bulkFixturesPath = new URL(
      "../../../tests/unit/fixtures/tree/web/",
      import.meta.url,
    );
    const bulkFixtureNames = readdirSync(bulkFixturesPath)
      .filter((name) => name.startsWith("chrome-") && name.endsWith(".xml"))
      .sort();

    it.for(bulkFixtureNames)("%s", (fixtureName) =>
      test(new URL(fixtureName, bulkFixturesPath)),
    );

    const evalFixturesPath = new URL(
      "./__fixtures__/eval/chrome/",
      import.meta.url,
    );
    const evalFixtureNames = readdirSync(evalFixturesPath).sort();

    it.for(evalFixtureNames)("%s", (fixtureName) =>
      test(new URL(fixtureName, evalFixturesPath)),
    );

    async function test(fixtureUrl: URL) {
      const fixtureXml = await fs.readFile(fixtureUrl, "utf-8");
      const tree = new ServerChromiumAccessibilityTree(fixtureXml);

      const fixturePath = fileURLToPath(fixtureUrl);
      const fixtureName = path.basename(fixturePath, ".xml");

      await expect(tree.toXml()).toMatchFileSnapshot(
        `./__snapshots__/chrome/${fixtureName}.snap.xml`,
      );
    }
  });
});

async function basicChromiumTree(): Promise<ServerChromiumAccessibilityTree> {
  const path = new URL(
    "./__fixtures__/chromium_accessibility_tree.json",
    import.meta.url,
  );
  const json = JSON.parse(await fs.readFile(path, "utf-8"));
  const clientAccessibilityTree = new ClientChromiumAccessibilityTree(json);
  return new ServerChromiumAccessibilityTree(clientAccessibilityTree.toStr());
}
