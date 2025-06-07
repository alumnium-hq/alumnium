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
    <generic id="62">
      <generic id="66">
        <generic id="67">
          <StaticText id="68">Welcome to ToDoList</StaticText>
        </generic>
        <Image name="roundedIcon" id="69" />
        <StaticText id="70">Start with a quick onboarding</StaticText>
        <generic id="72">
          <Button name="Continue" id="73">
            <StaticText id="74">Continue</StaticText>
            <Image name="checkmark.circle" id="75" label="Selected" />
            <TextField name="maskedElement" id="76" label="Enter Code" value="Entered value" />
          </Button>
        </generic>
      </generic>
    </generic>
  </Window>
</Application>
    """.strip()
    )


def test_nested_duplicated_tree(duplicated_tree: XCUITestAccessibilityTree):
    print(duplicated_tree.to_xml())
    assert (
        duplicated_tree.to_xml()
        == """
<Application name="FooBar" id="1">
  <Window id="2">
    <generic id="5">
      <generic name="Welcome to the new FooBar app! We're happy to have you! Reveal exclusive perks, save lots on stuff, and find gifts for everyone. Start acting today! Start Now" id="12">
        <generic name="Welcome to the new FooBar app! We're happy to have you! Reveal exclusive perks, save lots on stuff, and find gifts for everyone. Start acting today! Start Now" id="15">
          <generic name="Welcome to the new FooBar app! We're happy to have you! Reveal exclusive perks, save lots on stuff, and find gifts for everyone. Start acting today! Start Now" id="28">
            <generic name="Welcome to the new FooBar app! We're happy to have you! Reveal exclusive perks, save lots on stuff, and find gifts for everyone. Start acting today! Start Now" id="39">
              <generic name="Welcome to the new FooBar app! We're happy to have you!" id="40">
                <generic name="Welcome to the new FooBar app! We're happy to have you!" id="46">
                  <generic name="IconFooBar" id="49" />
                  <StaticText id="50">Welcome to the new FooBar app!</StaticText>
                  <StaticText id="51">We're happy to have you!</StaticText>
                </generic>
              </generic>
              <StaticText id="53">Reveal exclusive perks, save lots on stuff, and find gifts for everyone. Start acting today!</StaticText>
              <generic name="onboarding-footer-button" id="54" label="Start Now">
                <Button name="Start Now" id="56" />
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
