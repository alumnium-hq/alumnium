import { describe, expect, it } from "bun:test";
import { ChromiumAccessibilityTree as ClientChromiumAccessibilityTree } from "../../accessibility/ChromiumAccessibilityTree.ts";
import { ServerChromiumAccessibilityTree } from "./ServerChromiumAccessibilityTree.ts";

const FIXTURE_PATH = new URL(
  "./__fixtures__/chromium_accessibility_tree.json",
  import.meta.url,
);

async function chromiumTree(): Promise<ServerChromiumAccessibilityTree> {
  const json = await Bun.file(FIXTURE_PATH).json();
  const clientAccessibilityTree = new ClientChromiumAccessibilityTree(json);
  return new ServerChromiumAccessibilityTree(clientAccessibilityTree.toStr());
}

describe(ServerChromiumAccessibilityTree, () => {
  it("toXml converts tree to expected XML", async () => {
    const tree = await chromiumTree();

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
    const tree = await chromiumTree();
    const xml = tree.toXml(new Set(["id", "focusable"]));

    expect(xml.includes(" id=")).toBe(false);
    expect(xml.includes(" focusable=")).toBe(false);
  });
});
