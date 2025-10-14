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
