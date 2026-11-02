from xml.etree.ElementTree import Element, fromstring, indent, tostring

from .accessibility_element import AccessibilityElement
from .base_accessibility_tree import BaseAccessibilityTree

STATE_ATTRS = ["checked", "disabled", "expanded", "level", "pressed", "selected", "url", "placeholder"]


class AriaAccessibilityTree(BaseAccessibilityTree):
    """
    Accessibility tree built from an ARIA snapshot computed in the page (e.g. by
    acquiescence's `AriaSnapshotGenerator`), with elements addressed by their
    WebDriver BiDi shared IDs. Snapshots of frames are nested under their
    `iframe` nodes.

    The snapshot root mirrors acquiescence's `AriaNode`:
    https://github.com/jimevans/acquiescence/blob/main/src/ariaSnapshotGenerator.ts
    """

    def __init__(
        self,
        root: dict | None,
        shared_ids: dict[str, str],
        values: dict[str, str] | None = None,
        frames: dict[str, "AriaAccessibilityTree"] | None = None,
    ):
        self.root = root
        # Snapshot ref -> WebDriver BiDi shared ID of its element.
        self.shared_ids = shared_ids
        # Snapshot ref -> value the snapshot leaves out, e.g. chosen files.
        self.values = values or {}
        # Snapshot ref of an iframe -> snapshot of its document.
        self.frames = frames or {}
        self._next_raw_id = 0
        self._raw: str | None = None

    @classmethod
    def _from_xml(cls, xml_string: str) -> "AriaAccessibilityTree":
        instance = cls(root=None, shared_ids={})
        instance._raw = xml_string
        return instance

    def to_str(self) -> str:
        if self._raw is not None:
            return self._raw

        if not self.root:
            self._raw = ""
            return self._raw

        root = self._node_to_xml(self.root, self)
        indent(root)
        self._raw = tostring(root, encoding="unicode")
        return self._raw

    def _node_to_xml(self, node: dict, source: "AriaAccessibilityTree") -> Element:
        role = "RootWebArea" if node["role"] == "fragment" else node["role"]
        elem = self._element(role)

        ref = node.get("ref")
        shared_id = source.shared_ids.get(ref) if ref else None
        if shared_id:
            elem.set("sharedId", shared_id)
        if node.get("name"):
            elem.set("name", node["name"])
        value = source.values.get(ref) if ref else None
        if value:
            elem.set("value", value)
        for attr in STATE_ATTRS:
            if node.get(attr) is not None:
                elem.set(attr, self._to_str(node[attr]))

        for child in node.get("children", []):
            elem.append(self._text_to_xml(child) if isinstance(child, str) else self._node_to_xml(child, source))

        frame = source.frames.get(ref) if ref else None
        if frame and frame.root:
            elem.append(self._node_to_xml(frame.root, frame))

        return elem

    def _text_to_xml(self, text: str) -> Element:
        elem = self._element("text")
        elem.set("name", text)
        return elem

    def _element(self, role: str) -> Element:
        self._next_raw_id += 1
        elem = Element(role)
        elem.set("raw_id", str(self._next_raw_id))
        return elem

    def _to_str(self, value) -> str:
        if isinstance(value, bool):
            return "true" if value else "false"
        return str(value)

    def element_by_id(self, raw_id: int) -> AccessibilityElement:
        root = fromstring(f"<root>{self.to_str()}</root>")
        path = self._path_to_raw_id(root, str(raw_id))
        if path is None:
            raise KeyError(f"No element with raw_id={raw_id} found")

        element = path[-1]
        shared_id = element.get("sharedId")
        if shared_id is None:
            raise ValueError(f"Element with raw_id={raw_id} has no sharedId attribute")

        # Shared IDs of the iframes the element is nested in, outermost first.
        frame_shared_ids = [
            frame_shared_id
            for ancestor in path[:-1]
            if ancestor.tag == "iframe" and (frame_shared_id := ancestor.get("sharedId"))
        ]

        return AccessibilityElement(
            type=element.tag,
            shared_id=shared_id,
            frame_shared_ids=frame_shared_ids or None,
        )

    def _path_to_raw_id(self, elem: Element, raw_id: str) -> list[Element] | None:
        if elem.get("raw_id") == raw_id:
            return [elem]
        for child in elem:
            path = self._path_to_raw_id(child, raw_id)
            if path is not None:
                return [elem, *path]
        return None

    def scope_to_area(self, raw_id: int) -> "AriaAccessibilityTree":
        element = self._find_by_raw_id(raw_id)
        if element is None:
            return self

        element.tail = None
        indent(element)
        return self._from_xml(tostring(element, encoding="unicode"))

    def _find_by_raw_id(self, raw_id: int) -> Element | None:
        root = fromstring(f"<root>{self.to_str()}</root>")
        return root.find(f".//*[@raw_id='{raw_id}']")
