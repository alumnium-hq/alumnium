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
    assert chromium_tree.to_xml() == '<contentinfo name="Alumnium" id="1">Test Done!</contentinfo>'


def test_cached_ids(chromium_tree: AriaTree):
    assert chromium_tree.cached_ids == {1: 1001, 2: 420, 3: 69}


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
