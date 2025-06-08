# ruff: noqa: E501

from pathlib import Path
from pytest import fixture, mark
from json import load

from alumnium.accessibility import XCUITestAccessibilityTree


def tree(filename: str) -> XCUITestAccessibilityTree:
    with open(Path(__file__).parent.parent / "fixtures" / f"{filename}.xml", "r") as f:
        xml = f.read()
    return XCUITestAccessibilityTree(xml)


@fixture
def simple_tree() -> XCUITestAccessibilityTree:
    return tree("simple_xcuitest_accessibility_tree")


@fixture
def duplicated_tree() -> XCUITestAccessibilityTree:
    return tree("duplicated_xcuitest_accessibility_tree")


def test_simple_xctree(simple_tree: XCUITestAccessibilityTree):
    assert (
        simple_tree.to_xml()
        == """
<Application id="1" name="ToDoList">
  <Window id="2">
    <generic id="5">
      <NavigationBar id="6" name="BLTNBoard.BulletinView">
        <Button id="7" name="ToDoList" />
        <Button id="8" name="settingsIcon" />
      </NavigationBar>
      <generic id="11">
        <Table id="12">
          <Cell id="13">
            <StaticText id="14">0</StaticText>
            <StaticText id="17">All Tasks</StaticText>
          </Cell>
          <Cell id="21">
            <StaticText id="22">0</StaticText>
            <StaticText id="25">Today</StaticText>
          </Cell>
          <Cell id="28">
            <StaticText id="29">0</StaticText>
            <StaticText id="32">Tomorrow</StaticText>
          </Cell>
          <Cell id="35">
            <StaticText id="36">0</StaticText>
            <StaticText id="39">Next 7 Days</StaticText>
          </Cell>
          <Cell id="42">
            <StaticText id="45">Custom Interval</StaticText>
          </Cell>
          <Cell id="48">
            <StaticText id="49">0</StaticText>
            <StaticText id="52">Completed</StaticText>
          </Cell>
          <generic id="56" name="Vertical scroll bar, 1 page" />
          <generic id="58" name="Horizontal scroll bar, 1 page" />
        </Table>
        <Button id="59" name="Add Task">
          <StaticText id="60">Add Task</StaticText>
        </Button>
      </generic>
    </generic>
    <generic id="62">
      <generic id="66">
        <generic id="67">
          <StaticText id="68">Welcome to ToDoList</StaticText>
        </generic>
        <Image id="69" name="roundedIcon" />
        <StaticText id="70">Start with a quick onboarding</StaticText>
        <generic id="72">
          <Button id="73" name="Continue">
            <StaticText id="74">Continue</StaticText>
            <Image id="75" name="checkmark.circle" label="Selected" />
            <TextField id="76" name="maskedElement" label="Enter Code" value="Entered value" />
          </Button>
        </generic>
      </generic>
    </generic>
  </Window>
</Application>
    """.strip()
    )


def test_nested_duplicated_tree(duplicated_tree: XCUITestAccessibilityTree):
    assert (
        duplicated_tree.to_xml()
        == """
<Application id="1" name="FooBar">
  <Window id="2">
    <generic id="5">
      <generic id="12" name="Welcome to the new FooBar app! We're happy to have you! Reveal exclusive perks, save lots on stuff, and find gifts for everyone. Start acting today! Start Now">
        <generic id="15" name="Welcome to the new FooBar app! We're happy to have you! Reveal exclusive perks, save lots on stuff, and find gifts for everyone. Start acting today! Start Now">
          <generic id="28" name="Welcome to the new FooBar app! We're happy to have you! Reveal exclusive perks, save lots on stuff, and find gifts for everyone. Start acting today! Start Now">
            <generic id="39" name="Welcome to the new FooBar app! We're happy to have you! Reveal exclusive perks, save lots on stuff, and find gifts for everyone. Start acting today! Start Now">
              <generic id="40" name="Welcome to the new FooBar app! We're happy to have you!">
                <generic id="46" name="Welcome to the new FooBar app! We're happy to have you!">
                  <generic id="49" name="IconFooBar" />
                  <StaticText id="50">Welcome to the new FooBar app!</StaticText>
                  <StaticText id="51">We're happy to have you!</StaticText>
                </generic>
              </generic>
              <StaticText id="53">Reveal exclusive perks, save lots on stuff, and find gifts for everyone. Start acting today!</StaticText>
              <generic id="54" name="onboarding-footer-button" label="Start Now">
                <Button id="56" name="Start Now" />
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


def test_element_by_id(simple_tree: XCUITestAccessibilityTree):
    element = simple_tree.element_by_id(73)
    assert element.id == 73
    assert element.name == "Continue"
    assert element.type == "XCUIElementTypeButton"
