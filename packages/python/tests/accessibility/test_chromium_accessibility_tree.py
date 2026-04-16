# ruff: noqa: E501

from json import load
from pathlib import Path

from pytest import fixture

from alumnium.accessibility import ChromiumAccessibilityTree


@fixture
def chromium_tree() -> ChromiumAccessibilityTree:
    with open(Path(__file__).parent.parent / "fixtures/chromium_accessibility_tree.json", "r") as f:
        json = load(f)
    return ChromiumAccessibilityTree(json)


def test_element_by_id(chromium_tree: ChromiumAccessibilityTree):
    assert chromium_tree.element_by_id(1).backend_node_id == 7
    assert chromium_tree.element_by_id(2).backend_node_id == 6
    assert chromium_tree.element_by_id(3).backend_node_id == 5


def test_scope_to_area_returns_original_if_not_found(chromium_tree: ChromiumAccessibilityTree):
    # Try to scope to a non-existent element
    result = chromium_tree.scope_to_area(99999)

    # Should return the original tree when element not found
    assert result.to_str() == chromium_tree.to_str()
