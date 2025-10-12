from abc import ABC, abstractmethod
from xml.etree.ElementTree import Element, fromstring, indent, tostring


class BaseRawTree(ABC):
    @abstractmethod
    def to_str(self) -> str:
        pass

    @staticmethod
    def scope_to_area(raw_xml: str, raw_id: int | str) -> str:
        """
        Scope raw XML to a specific area by raw_id.
        Extracts the subtree rooted at the element with the given raw_id.

        Args:
            raw_xml: The raw XML string
            raw_id: The raw_id attribute value to scope to (int or str)

        Returns:
            Scoped raw XML string containing only the specified subtree
        """
        # Parse the XML (wrap in root if there are multiple top-level elements)
        try:
            root = fromstring(raw_xml)
            wrapped = False
        except Exception:
            root = fromstring(f"<root>{raw_xml}</root>")
            wrapped = True

        # Find the element with the matching raw_id
        def find_element(elem: Element, target_id: str) -> Element | None:
            # Check for raw_id attribute
            if elem.get("raw_id") == target_id:
                return elem

            # Recursively search children
            for child in elem:
                result = find_element(child, target_id)
                if result is not None:
                    return result
            return None

        search_root = root if not wrapped else root
        target_elem = find_element(search_root, str(raw_id))

        if target_elem is None:
            # If not found, return original tree
            return raw_xml

        # Convert the scoped element back to XML string
        indent(target_elem)
        return tostring(target_elem, encoding="unicode")
