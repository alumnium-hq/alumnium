import fs from "node:fs/promises";
import { describe, expect, it } from "vitest";
import { ChromiumAccessibilityTree as ClientChromiumAccessibilityTree } from "../../accessibility/ChromiumAccessibilityTree.ts";
import { ServerChromiumAccessibilityTree } from "./ServerChromiumAccessibilityTree.ts";
import { lit } from "smollit";

describe(ServerChromiumAccessibilityTree, () => {
  describe("toXml", () => {
    it("toXml converts tree to expected XML", async () => {
      const tree = await basicChromiumTree();

      expect(tree.toXml()).toBe(
        `
<RootWebArea name="TodoMVC: React" id="1" focusable="true">
  <generic id="4">
    <generic id="5">
      <heading id="6" level="1">
        todos
      </heading>
      <generic id="8">
        <textbox name="New Todo Input" id="9" invalid="false" focusable="true" editable="plaintext" settable="true" multiline="false" readonly="false" required="false" labelledby=""/>
        <LabelText id="12">
          New Todo Input
        </LabelText>
      </generic>
    </generic>
    <main id="14">
      <generic id="15">
        <checkbox id="16" invalid="false" focusable="true" checked="false"/>
        <LabelText id="17">
          <generic id="18">
            \\u276f
          </generic>
          Toggle All Input
        </LabelText>
      </generic>
      <list id="21">
        <listitem id="22" level="1">
          <checkbox id="24" invalid="false" focusable="true" focused="true" checked="true"/>
          <LabelText id="25">
            hello
          </LabelText>
        </listitem>
        <listitem id="27" level="1">
          <checkbox id="29" invalid="false" focusable="true" checked="false"/>
          <LabelText id="30">
            he
          </LabelText>
        </listitem>
      </list>
    </main>
    <generic id="32">
      1 item left!
      <list id="35">
        <listitem id="36" level="1">
          <link id="37" focusable="true">
            All
          </link>
        </listitem>
        <listitem id="39" level="1">
          <link id="40" focusable="true">
            Active
          </link>
        </listitem>
        <listitem id="42" level="1">
          <link id="43" focusable="true">
            Completed
          </link>
        </listitem>
      </list>
      <button id="45" invalid="false" focusable="true">
        Clear completed
      </button>
    </generic>
  </generic>
  <contentinfo id="47">
    <paragraph id="48">
      Double-click to edit a todo
    </paragraph>
    <paragraph id="50">
      Created by the TodoMVC Team
    </paragraph>
    <paragraph id="52">
      Part of
      <link id="54" focusable="true">
        TodoMVC
      </link>
    </paragraph>
  </contentinfo>
</RootWebArea>
`.trim(),
      );
    });

    it("toXml supports excluding attributes", async () => {
      const tree = await basicChromiumTree();
      const xml = tree.toXml(new Set(["id", "focusable"]));

      expect(xml.includes(" id=")).toBe(false);
      expect(xml.includes(" focusable=")).toBe(false);
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
                                  <none raw_id="18" backendDOMNodeId="885" nodeId="885" ignored="true"/></none>
                              </generic>
                            </button>
                            <generic raw_id="19" backendDOMNodeId="887" nodeId="887" ignored="false" name="">
                              <generic raw_id="20" backendDOMNodeId="888" nodeId="888" ignored="false" name=""/>
                              <generic raw_id="21" backendDOMNodeId="889" nodeId="889" ignored="false" name=""/></generic>
                          </generic>
                          <generic raw_id="22" backendDOMNodeId="11" nodeId="11" ignored="false" name="">
                            <link raw_id="23" backendDOMNodeId="21" nodeId="21" ignored="false" name="YouTube Home" focusable="true" url="https://www.youtube.com/">
                              <generic raw_id="24" backendDOMNodeId="890" nodeId="890" ignored="false" name="">
                                <generic raw_id="25" backendDOMNodeId="892" nodeId="892" ignored="false" name="">
                                  <none raw_id="26" backendDOMNodeId="893" nodeId="893" ignored="true">
                                    <none raw_id="27" backendDOMNodeId="894" nodeId="894" ignored="true"/></none>
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
                              <generic raw_id="39" backendDOMNodeId="941" nodeId="941" ignored="false" name=""/></generic>
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
        "<RootWebArea name="YouTube" id="1" focusable="true" url="https://www.youtube.com/">
          <generic id="3">
            <generic id="4">
              <generic id="6">
                <generic id="7">
                  <banner id="8">
                    <generic id="12">
                      <generic id="13">
                        <generic id="14">
                          <button name="Guide" id="15" invalid="false" focusable="true" pressed="true">
                            <generic id="16"/>
                          </button>
                          <generic id="19"/>
                        </generic>
                        <generic id="22">
                          <link name="YouTube Home" id="23" focusable="true" url="https://www.youtube.com/">
                            <generic id="24">
                              <generic id="25"/>
                            </generic>
                          </link>
                          <generic id="28">
                            SG
                          </generic>
                        </generic>
                        <generic id="31">
                          <generic id="32">
                            <button id="34" invalid="false" focusable="true">
                              <generic id="35">
                                Skip navigation
                              </generic>
                            </button>
                          </generic>
                        </generic>
                      </generic>
                    </generic>
                  </banner>
                </generic>
              </generic>
            </generic>
          </generic>
        </RootWebArea>"
      `);
    });
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

async function youtubeChromiumTree(): Promise<ServerChromiumAccessibilityTree> {
  const path = new URL(
    "./__fixtures__/chromium_youtube_accessibility_tree.xml",
    import.meta.url,
  );
  const rawTree = await fs.readFile(path, "utf-8");
  return new ServerChromiumAccessibilityTree(rawTree);
}
