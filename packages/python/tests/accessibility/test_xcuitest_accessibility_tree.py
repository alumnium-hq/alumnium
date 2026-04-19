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


def test_scope_to_area_returns_original_if_not_found(simple_tree: XCUITestAccessibilityTree):
    # Try to scope to a non-existent element
    result = simple_tree.scope_to_area(99999)
    # Should return the original tree when element not found
    assert result.to_str() == simple_tree.to_str()
