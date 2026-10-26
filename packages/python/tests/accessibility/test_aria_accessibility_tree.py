from pytest import fixture, raises

from alumnium.accessibility import AriaAccessibilityTree


@fixture
def aria_tree() -> AriaAccessibilityTree:
    """ARIA snapshot of a TodoMVC page taken by acquiescence in Firefox."""
    root = {
        "role": "fragment",
        "name": "",
        "children": [
            {"role": "heading", "name": "todos", "ref": "e1", "level": 1, "children": []},
            {
                "role": "textbox",
                "name": "What needs to be done?",
                "ref": "e2",
                "placeholder": "What needs to be done?",
                "children": [],
            },
            {
                "role": "list",
                "name": "",
                "ref": "e3",
                "children": [
                    {
                        "role": "listitem",
                        "name": "",
                        "ref": "e4",
                        "children": [
                            {"role": "checkbox", "name": "", "ref": "e5", "checked": False, "children": []},
                            "buy milk",
                            {"role": "button", "name": "×", "ref": "e6", "children": []},
                        ],
                    }
                ],
            },
            "0 items left",
        ],
    }
    shared_ids = {f"e{i}": f"shared-{i}" for i in range(1, 7)}
    return AriaAccessibilityTree(root, shared_ids)


def test_to_str(aria_tree: AriaAccessibilityTree):
    assert aria_tree.to_str() == (
        '<RootWebArea raw_id="1">\n'
        '  <heading raw_id="2" sharedId="shared-1" name="todos" level="1" />\n'
        '  <textbox raw_id="3" sharedId="shared-2" name="What needs to be done?" placeholder="What needs to be done?" />\n'  # noqa: E501
        '  <list raw_id="4" sharedId="shared-3">\n'
        '    <listitem raw_id="5" sharedId="shared-4">\n'
        '      <checkbox raw_id="6" sharedId="shared-5" checked="false" />\n'
        '      <text raw_id="7" name="buy milk" />\n'
        '      <button raw_id="8" sharedId="shared-6" name="×" />\n'
        "    </listitem>\n"
        "  </list>\n"
        '  <text raw_id="9" name="0 items left" />\n'
        "</RootWebArea>"
    )


def test_element_by_id(aria_tree: AriaAccessibilityTree):
    element = aria_tree.element_by_id(8)
    assert element.type == "button"
    assert element.shared_id == "shared-6"


def test_element_by_id_without_shared_id(aria_tree: AriaAccessibilityTree):
    with raises(ValueError, match="Element with raw_id=7 has no sharedId attribute"):
        aria_tree.element_by_id(7)
    with raises(KeyError, match="No element with raw_id=100 found"):
        aria_tree.element_by_id(100)


def test_scope_to_area(aria_tree: AriaAccessibilityTree):
    area = aria_tree.scope_to_area(5)
    assert area.to_str() == (
        '<listitem raw_id="5" sharedId="shared-4">\n'
        '  <checkbox raw_id="6" sharedId="shared-5" checked="false" />\n'
        '  <text raw_id="7" name="buy milk" />\n'
        '  <button raw_id="8" sharedId="shared-6" name="×" />\n'
        "</listitem>"
    )
    assert area.element_by_id(6).shared_id == "shared-5"


def test_values():
    tree = AriaAccessibilityTree(
        {
            "role": "fragment",
            "name": "",
            "children": [{"role": "button", "name": "Choose File", "ref": "e1", "children": []}],
        },
        {"e1": "shared-1"},
        {"e1": "report.txt"},
    )
    assert '<button raw_id="2" sharedId="shared-1" name="Choose File" value="report.txt" />' in tree.to_str()
