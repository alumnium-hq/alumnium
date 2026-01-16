# ruff: noqa: E501

from json import load
from pathlib import Path

from pytest import fixture

from alumnium.accessibility import ChromiumAccessibilityTree as ClientChromiumAccessibilityTree
from alumnium.server.accessibility import ServerChromiumAccessibilityTree


@fixture
def chromium_tree() -> ServerChromiumAccessibilityTree:
    with open(Path(__file__).parent.parent.parent / "fixtures/chromium_accessibility_tree.json", "r") as f:
        json = load(f)
    client_accessibility_tree = ClientChromiumAccessibilityTree(json)
    return ServerChromiumAccessibilityTree(client_accessibility_tree.to_str())


def test_to_xml(chromium_tree: ServerChromiumAccessibilityTree):
    assert (
        chromium_tree.to_xml()
        == """
<RootWebArea name=": React" id="1" focusable="True">
  <generic id="4">
    <generic id="5">
      <heading id="6" level="1">todos</heading>
      <generic id="8">
        <textbox name="New Todo Input" id="9" invalid="false" focusable="True" editable="plaintext" settable="True" multiline="False" readonly="False" required="False" labelledby="" />
        <LabelText id="12">New Todo Input</LabelText>
      </generic>
    </generic>
    <main id="14">
      <generic id="15">
        <checkbox id="16" invalid="false" focusable="True" checked="false" />
        <LabelText id="17">Toggle All Input<generic id="18">\\u276f</generic>
        </LabelText>
      </generic>
      <list id="21">
        <listitem id="22" level="1">
          <checkbox id="24" invalid="false" focusable="True" focused="True" checked="true" />
          <LabelText id="25">hello</LabelText>
        </listitem>
        <listitem id="27" level="1">
          <checkbox id="29" invalid="false" focusable="True" checked="false" />
          <LabelText id="30">he</LabelText>
        </listitem>
      </list>
    </main>
    <generic id="32">1 item left!<list id="35">
        <listitem id="36" level="1">
          <link id="37" focusable="True">All</link>
        </listitem>
        <listitem id="39" level="1">
          <link id="40" focusable="True">Active</link>
        </listitem>
        <listitem id="42" level="1">
          <link id="43" focusable="True">Completed</link>
        </listitem>
      </list>
      <button id="45" invalid="false" focusable="True">Clear completed</button>
    </generic>
  </generic>
  <contentinfo id="47">
    <paragraph id="48">Double-click to edit a todo</paragraph>
    <paragraph id="50">Created by the TodoMVC Team</paragraph>
    <paragraph id="52">Part of<link id="54" focusable="True">TodoMVC</link>
    </paragraph>
  </contentinfo>
</RootWebArea>
""".strip()
    )


def test_exclude_attrs(chromium_tree: ServerChromiumAccessibilityTree):
    xml = chromium_tree.to_xml(exclude_attrs={"id", "focusable"})
    assert " id=" not in xml
    assert " focusable=" not in xml
