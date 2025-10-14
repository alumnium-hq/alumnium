# ruff: noqa: E501
import unicodedata
from pathlib import Path

from pytest import fixture

from alumnium.accessibility import UIAutomator2AccessibilityTree


def tree(filename: str) -> UIAutomator2AccessibilityTree:
    with open(Path(__file__).parent.parent / "fixtures" / f"{filename}.xml", "r", encoding="UTF-8") as f:
        xml = unicodedata.normalize("NFKC", f.read())
    return UIAutomator2AccessibilityTree(xml)


@fixture
def simple_tree() -> UIAutomator2AccessibilityTree:
    return tree("uiautomator2_accessibility_tree")


def test_element_by_id(simple_tree: UIAutomator2AccessibilityTree):
    print(simple_tree.to_str())
    element = simple_tree.element_by_id(9)
    assert element.id == 9
    assert element.androidresourceid == "org.wikipedia.alpha:id/fragment_container"
    assert element.type == "android.widget.FrameLayout"
