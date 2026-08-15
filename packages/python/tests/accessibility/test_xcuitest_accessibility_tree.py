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


def test_tracks_positions_among_elements_with_same_locator_attributes():
    duplicate_tree = duplicate_elements_tree()

    assert duplicate_tree.element_by_id(2).index == 0
    assert duplicate_tree.element_by_id(2).match_count == 3
    assert duplicate_tree.element_by_id(5).index == 1
    assert duplicate_tree.element_by_id(5).match_count == 3
    assert duplicate_tree.element_by_id(7).index == 2
    assert duplicate_tree.element_by_id(7).match_count == 3


def test_scope_to_area_preserves_full_tree_ids_and_locator_positions():
    duplicate_tree = duplicate_elements_tree()
    area = duplicate_tree.scope_to_area(4)

    assert 'raw_id="7"' in area.to_str()
    assert area.element_by_id(7).index == 2
    assert area.element_by_id(7).match_count == 3


def duplicate_elements_tree() -> XCUITestAccessibilityTree:
    return XCUITestAccessibilityTree(
        """<XCUIElementTypeApplication>
        <XCUIElementTypeButton name="Action" label="Action">
            <XCUIElementTypeStaticText name="First"/>
        </XCUIElementTypeButton>
        <XCUIElementTypeOther name="Area">
            <XCUIElementTypeButton name="Action" label="Action">
                <XCUIElementTypeStaticText name="Second"/>
            </XCUIElementTypeButton>
            <XCUIElementTypeButton name="Action" label="Action">
                <XCUIElementTypeStaticText name="Third"/>
            </XCUIElementTypeButton>
        </XCUIElementTypeOther>
        </XCUIElementTypeApplication>"""
    )
