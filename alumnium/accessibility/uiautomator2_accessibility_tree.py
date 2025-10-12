from xml.etree.ElementTree import Element, fromstring, indent, tostring

from .accessibility_element import AccessibilityElement
from .base_accessibility_tree import BaseAccessibilityTree


class UIAutomator2AccessibilityTree(BaseAccessibilityTree):
    def __init__(self, xml_string: str):
        self.xml_string = xml_string
        self._next_raw_id = 1

    def to_str(self) -> str:
        """Parse XML and add raw_id attributes to all elements."""
        # Reset counter for deterministic raw_id assignment
        self._next_raw_id = 1

        # Parse the XML
        root = fromstring(self.xml_string)

        # Add raw_id attributes recursively
        self._add_raw_ids(root)

        # Serialize back to string
        indent(root)
        return tostring(root, encoding="unicode")

    def _get_next_raw_id(self) -> int:
        """Get next sequential raw_id."""
        raw_id = self._next_raw_id
        self._next_raw_id += 1
        return raw_id

    def _add_raw_ids(self, elem: Element) -> None:
        """Recursively add raw_id attribute to element and its children."""
        elem.set("raw_id", str(self._get_next_raw_id()))
        for child in elem:
            self._add_raw_ids(child)

    def element_by_id(self, raw_id: int) -> AccessibilityElement:
        """
        Find element by raw_id and return its properties for XPath construction.

        Args:
            raw_id: The raw_id to search for

        Returns:
            AccessibilityElement with type, androidresourceid, androidtext, androidcontentdesc, androidbounds
        """
        # Get raw XML with raw_id attributes
        raw_xml = self.to_str()
        root = fromstring(raw_xml)

        # Find element with matching raw_id
        def find_element(elem: Element, target_id: str) -> Element | None:
            if elem.get("raw_id") == target_id:
                return elem
            for child in elem:
                result = find_element(child, target_id)
                if result is not None:
                    return result
            return None

        element = find_element(root, str(raw_id))
        if element is None:
            raise KeyError(f"No element with raw_id={raw_id} found")

        # Extract properties for UIAutomator2
        return AccessibilityElement(
            type=element.get("class", element.tag),
            androidresourceid=element.get("resource-id"),
            androidtext=element.get("text"),
            androidcontentdesc=element.get("content-desc"),
            androidbounds=element.get("bounds"),
        )
