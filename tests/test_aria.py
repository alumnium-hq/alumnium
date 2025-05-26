# ruff: noqa: E501

from pathlib import Path
from pytest import fixture
from json import load

from alumnium.aria import AriaTree, XCAriaTree


@fixture
def chromium_tree() -> AriaTree:
    with open(Path(__file__).parent / "fixtures/chromium_accessibility_tree.json", "r") as f:
        json = load(f)
    return AriaTree(json)


@fixture
def xcuitest_tree() -> XCAriaTree:
    with open(Path(__file__).parent / "fixtures/xcuitest_accessibility_tree.xml", "r") as f:
        xml = f.read()
    return XCAriaTree(xml)


def test_to_xml(chromium_tree: AriaTree):
    assert (
        chromium_tree.to_xml()
        == """
<RootWebArea name="TodoMVC: React" id="1" focusable="True">
  <generic id="4">
    <generic id="6">
      <heading name="todos" id="12" level="1">todos</heading>
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
          <link name="All" id="47" focusable="True">All</link>
        </listitem>
        <listitem id="32" level="1">
          <link name="Active" id="48" focusable="True">Active</link>
        </listitem>
        <listitem id="33" level="1">
          <link name="Completed" id="49" focusable="True">Completed</link>
        </listitem>
      </list>
      <button name="Clear completed" id="19" invalid="false" focusable="True">Clear completed</button>
    </generic>
  </generic>
  <contentinfo id="5">
    <paragraph id="9">Double-click to edit a todo</paragraph>
    <paragraph id="10">Created by the TodoMVC Team</paragraph>
    <paragraph id="11">Part of <link name="TodoMVC" id="23" focusable="True">TodoMVC</link>
    </paragraph>
  </contentinfo>
</RootWebArea>
""".strip()
    )


# def test_cached_ids(chromium_tree: AriaTree):
#     assert chromium_tree.cached_ids == {1: 1001, 2: 420, 3: 69}


def test_xctree(xcuitest_tree: XCAriaTree):
    assert (
        xcuitest_tree.to_xml()
        == """
<Application name="ToDoList" id="1">
  <Window id="2">
    <generic id="61">
      <generic id="62">
        <generic id="65">
          <generic id="66">
            <generic id="67">
              <StaticText id="68">Welcome to ToDoList</StaticText>
            </generic>
            <Image name="roundedIcon" id="69" />
            <StaticText id="70">Start with a quick onboarding</StaticText>
            <generic id="71">
              <generic id="72">
                <Button name="Continue" id="73">
                  <StaticText id="74">Continue</StaticText>
                  <Image name="checkmark.circle" id="75" />
                </Button>
              </generic>
            </generic>
          </generic>
        </generic>
      </generic>
    </generic>
  </Window>
</Application>
    """.strip()
    )
