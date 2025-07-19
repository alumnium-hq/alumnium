from pathlib import Path
from pytest import fixture

from alumnium.accessibility.uiautomator2_accessibility_tree import UIAutomator2AccessibiltyTree


def tree(filename: str) -> UIAutomator2AccessibiltyTree:
    with open(Path(__file__).parent.parent / "fixtures" / f"{filename}.xml", "r") as f:
        xml = f.read()
    return UIAutomator2AccessibiltyTree(xml)


@fixture
def simple_tree() -> UIAutomator2AccessibiltyTree:
    return tree("uiautomator2_accessibility_tree")


def test_element_by_id(simple_tree: UIAutomator2AccessibiltyTree):
    element = simple_tree.element_by_id(8)
    assert element.id == 8
    assert element.androidresourceid == "org.wikipedia.alpha:id/fragment_container"
    assert element.type == "android.widget.FrameLayout"
