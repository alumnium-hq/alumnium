# ruff: noqa: E501

from pathlib import Path

from pytest import fixture

from alumnium.accessibility import XCUITestAccessibilityTree


def tree(filename: str) -> XCUITestAccessibilityTree:
    with open(Path(__file__).parent.parent / "fixtures" / f"{filename}.xml", "r") as f:
        xml = f.read()
    return XCUITestAccessibilityTree(xml)


@fixture
def simple_tree() -> XCUITestAccessibilityTree:
    return tree("simple_xcuitest_accessibility_tree")


def test_element_by_id(simple_tree: XCUITestAccessibilityTree):
    element = simple_tree.element_by_id(74)
    assert element.id == 74
    assert element.name == "Continue"
    assert element.type == "XCUIElementTypeButton"
