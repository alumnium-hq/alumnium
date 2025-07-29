# ruff: noqa: E501

from pathlib import Path
from pytest import fixture
from json import load

from alumnium.accessibility import ChromiumAccessibilityTree


@fixture
def chromium_tree() -> ChromiumAccessibilityTree:
    with open(Path(__file__).parent.parent / "fixtures/chromium_accessibility_tree.json", "r") as f:
        json = load(f)
    return ChromiumAccessibilityTree(json)


def test_to_xml(chromium_tree: ChromiumAccessibilityTree):
    assert (
        chromium_tree.to_xml()
        == """
<RootWebArea name=": React" id="1" focusable="True">
  <generic id="4">
    <generic id="6">
      <heading id="12" level="1">todos</heading>
      <generic id="13">
        <textbox name="New Todo Input" id="25" invalid="false" focusable="True" editable="plaintext" settable="True" multiline="False" readonly="False" required="False" labelledby="" />
        <LabelText id="26">New Todo Input</LabelText>
      </generic>
    </generic>
    <main id="7">
      <generic id="14">
        <checkbox id="27" invalid="false" focusable="True" checked="false" />
        <LabelText id="28">Toggle All Input<generic id="39">\\u276f</generic>
        </LabelText>
      </generic>
      <list id="15">
        <listitem id="29" level="1">
          <checkbox id="42" invalid="false" focusable="True" focused="True" checked="true" />
          <LabelText id="43">hello</LabelText>
        </listitem>
        <listitem id="30" level="1">
          <checkbox id="45" invalid="false" focusable="True" checked="false" />
          <LabelText id="46">he</LabelText>
        </listitem>
      </list>
    </main>
    <generic id="8">1 item left!<list id="18">
        <listitem id="31" level="1">
          <link id="47" focusable="True">All</link>
        </listitem>
        <listitem id="32" level="1">
          <link id="48" focusable="True">Active</link>
        </listitem>
        <listitem id="33" level="1">
          <link id="49" focusable="True">Completed</link>
        </listitem>
      </list>
      <button id="19" invalid="false" focusable="True">Clear completed</button>
    </generic>
  </generic>
  <contentinfo id="5">
    <paragraph id="9">Double-click to edit a todo</paragraph>
    <paragraph id="10">Created by the TodoMVC Team</paragraph>
    <paragraph id="11">Part of<link id="23" focusable="True">TodoMVC</link>
    </paragraph>
  </contentinfo>
</RootWebArea>
""".strip()
    )


def test_element_by_id(chromium_tree: ChromiumAccessibilityTree):
    assert chromium_tree.element_by_id(1).id == 7
    assert chromium_tree.element_by_id(2).id == 6
    assert chromium_tree.element_by_id(3).id == 5
