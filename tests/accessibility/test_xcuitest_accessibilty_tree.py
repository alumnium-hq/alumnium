from pathlib import Path
from pytest import fixture
from json import load

from alumnium.accessibility import XCUITestAccessibilityTree


@fixture
def xcuitest_tree() -> XCUITestAccessibilityTree:
    with open(Path(__file__).parent.parent / "fixtures/xcuitest_accessibility_tree.xml", "r") as f:
        xml = f.read()
    return XCUITestAccessibilityTree(xml)


def test_xctree(xcuitest_tree: XCUITestAccessibilityTree):
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


def test_element_by_id(xcuitest_tree: XCUITestAccessibilityTree):
    element = xcuitest_tree.element_by_id(73)
    assert element.id == 73
    assert element.name == "Continue"
    assert element.type == "XCUIElementTypeButton"
