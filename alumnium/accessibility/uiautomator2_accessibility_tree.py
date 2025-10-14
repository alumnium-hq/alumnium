from re import compile
from xml.etree.ElementTree import Element, fromstring, indent, tostring

from .accessibility_element import AccessibilityElement
from .base_accessibility_tree import BaseAccessibilityTree


class UIAutomator2AccessibilityTree(BaseAccessibilityTree):
    def __init__(self, xml_string: str):
        # cleaning multiple xml declaration lines from page source
        xml_declaration_pattern = compile(r"^\s*<\?xml.*\?>\s*$")
        lines = xml_string.splitlines()
        cleaned_lines = [line for line in lines if not xml_declaration_pattern.match(line)]
        cleaned_xml_content = "\n".join(cleaned_lines)
        self.xml_string = (
            f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n <root>\n{cleaned_xml_content}\n</root>"
        )

        self._next_raw_id = 0
        self._raw = None

    def to_str(self) -> str:
        """Parse XML and add raw_id attributes to all elements."""
        if self._raw is not None:
            return self._raw

        # Parse the XML
        root = fromstring(self.xml_string)

        # Add raw_id attributes recursively
        self._add_raw_ids(root)

        # Serialize back to string
        indent(root)
        self._raw = tostring(root, encoding="unicode")
        return self._raw

    def _add_raw_ids(self, elem: Element) -> None:
        """Recursively add raw_id attribute to element and its children."""
        self._next_raw_id += 1
        elem.set("raw_id", str(self._next_raw_id))
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
            id=raw_id,
            type=element.get("class", element.tag),
            androidresourceid=element.get("resource-id"),
            androidtext=element.get("text"),
            androidcontentdesc=element.get("content-desc"),
            androidbounds=element.get("bounds"),
        )

    def scope_to_area(self, raw_id: int) -> "UIAutomator2AccessibilityTree":
        """Scope the tree to a smaller subtree identified by raw_id."""
        raw_xml = self.to_str()

        # Parse the XML
        root = fromstring(raw_xml)

        # Find the element with the matching raw_id
        def find_element(elem: Element, target_id: str) -> Element | None:
            if elem.get("raw_id") == target_id:
                return elem
            for child in elem:
                result = find_element(child, target_id)
                if result is not None:
                    return result
            return None

        target_elem = find_element(root, str(raw_id))

        if target_elem is None:
            # If not found, return original tree
            return self

        # Convert the scoped element back to XML string
        indent(target_elem)
        scoped_xml = tostring(target_elem, encoding="unicode")

        return UIAutomator2AccessibilityTree(scoped_xml)
