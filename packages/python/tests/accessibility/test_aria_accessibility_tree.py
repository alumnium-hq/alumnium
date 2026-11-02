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


@fixture
def frames_tree() -> AriaAccessibilityTree:
    """ARIA snapshot of a page with an iframe nesting another iframe."""

    def page(name: str, children: list) -> dict:
        return {"role": "fragment", "name": name, "children": children}

    def button(name: str) -> dict:
        return {"role": "button", "name": name, "ref": "e1", "children": []}

    iframe = {"role": "iframe", "name": "", "ref": "e2", "children": []}
    inner = AriaAccessibilityTree(page("Inner", [button("Inner")]), {"e1": "shared-5"})
    outer = AriaAccessibilityTree(
        page("Outer", [button("Outer"), iframe]), {"e1": "shared-3", "e2": "shared-4"}, frames={"e2": inner}
    )
    return AriaAccessibilityTree(
        page("", [button("Top"), iframe]), {"e1": "shared-1", "e2": "shared-2"}, frames={"e2": outer}
    )


def test_frames_to_str(frames_tree: AriaAccessibilityTree):
    assert frames_tree.to_str() == (
        '<RootWebArea raw_id="1">\n'
        '  <button raw_id="2" sharedId="shared-1" name="Top" />\n'
        '  <iframe raw_id="3" sharedId="shared-2">\n'
        '    <RootWebArea raw_id="4" name="Outer">\n'
        '      <button raw_id="5" sharedId="shared-3" name="Outer" />\n'
        '      <iframe raw_id="6" sharedId="shared-4">\n'
        '        <RootWebArea raw_id="7" name="Inner">\n'
        '          <button raw_id="8" sharedId="shared-5" name="Inner" />\n'
        "        </RootWebArea>\n"
        "      </iframe>\n"
        "    </RootWebArea>\n"
        "  </iframe>\n"
        "</RootWebArea>"
    )


def test_element_by_id_in_frames(frames_tree: AriaAccessibilityTree):
    top = frames_tree.element_by_id(2)
    assert top.shared_id == "shared-1"
    assert top.frame_shared_ids is None

    outer = frames_tree.element_by_id(5)
    assert outer.shared_id == "shared-3"
    assert outer.frame_shared_ids == ["shared-2"]

    inner = frames_tree.element_by_id(8)
    assert inner.shared_id == "shared-5"
    assert inner.frame_shared_ids == ["shared-2", "shared-4"]
