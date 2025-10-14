from xml.etree.ElementTree import Element, fromstring, indent, tostring

from .accessibility_element import AccessibilityElement
from .base_accessibility_tree import BaseAccessibilityTree


class ChromiumAccessibilityTree(BaseAccessibilityTree):
    def __init__(self, cdp_response: dict):
        self.cdp_response = cdp_response
        self._next_raw_id = 0
        self._raw = None

    @classmethod
    def _from_xml(cls, xml_string: str) -> "ChromiumAccessibilityTree":
        """Create a ChromiumAccessibilityTree instance from pre-computed XML."""
        instance = cls(cdp_response={})
        instance._raw = xml_string
        return instance

    def to_str(self) -> str:
        """Convert CDP response to raw XML format preserving all data."""
        if self._raw is not None:
            return self._raw

        nodes = self.cdp_response["nodes"]

        # Create a lookup table for nodes by their ID
        node_lookup = {node["nodeId"]: node for node in nodes}

        # Build tree structure and convert to XML
        root_nodes = []
        for node in nodes:
            if node.get("parentId") is None:
                xml_node = self._node_to_xml(node, node_lookup)
                root_nodes.append(xml_node)

        # Combine all root nodes into a single XML string
        xml_string = ""
        for root in root_nodes:
            indent(root)
            xml_string += tostring(root, encoding="unicode")

        self._raw = xml_string
        return self._raw

    def _node_to_xml(self, node: dict, node_lookup: dict) -> Element:
        """Convert a CDP node to XML element, recursively processing children."""
        # Create element with role as tag
        role = node.get("role", {}).get("value", "unknown")
        elem = Element(role)

        # Add our own sequential raw_id attribute
        self._next_raw_id += 1
        elem.set("raw_id", str(self._next_raw_id))

        # Add all node attributes as XML attributes
        if "backendDOMNodeId" in node:
            elem.set("backendDOMNodeId", str(node["backendDOMNodeId"]))
        if "nodeId" in node:
            elem.set("nodeId", str(node["nodeId"]))
        if "ignored" in node:
            elem.set("ignored", str(node["ignored"]))

        # Add name as attribute if present
        if "name" in node and "value" in node["name"]:
            elem.set("name", node["name"]["value"])

        # Add properties as attributes
        if "properties" in node:
            for prop in node["properties"]:
                prop_name = prop.get("name", "")
                prop_value = prop.get("value", {})
                if isinstance(prop_value, dict) and "value" in prop_value:
                    elem.set(prop_name, str(prop_value["value"]))
                elif isinstance(prop_value, dict):
                    # Complex property values (like nodeList) are converted to empty string
                    elem.set(prop_name, "")
                else:
                    elem.set(prop_name, str(prop_value))

        # Process children recursively
        if "childIds" in node:
            for child_id in node["childIds"]:
                if child_id in node_lookup:
                    child_elem = self._node_to_xml(node_lookup[child_id], node_lookup)
                    elem.append(child_elem)

        return elem

    def element_by_id(self, raw_id: int) -> AccessibilityElement:
        """
        Find element by raw_id and return its properties for element finding.

        Args:
            raw_id: The raw_id to search for

        Returns:
            AccessibilityElement with backend_node_id set
        """
        # Get raw XML with raw_id attributes
        raw_xml = self.to_str()
        root = fromstring(f"<root>{raw_xml}</root>")

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

        # Extract backendDOMNodeId for Chromium
        backend_node_id_str = element.get("backendDOMNodeId")
        if backend_node_id_str is None:
            raise ValueError(f"Element with raw_id={raw_id} has no backendDOMNodeId attribute")

        return AccessibilityElement(
            type=element.tag,
            backend_node_id=int(backend_node_id_str),
        )

    def scope_to_area(self, raw_id: int) -> "ChromiumAccessibilityTree":
        """Scope the tree to a smaller subtree identified by raw_id."""
        raw_xml = self.to_str()

        # Parse the XML (wrap in root if there are multiple top-level elements)
        try:
            root = fromstring(raw_xml)
            wrapped = False
        except Exception:
            root = fromstring(f"<root>{raw_xml}</root>")
            wrapped = True

        # Find the element with the matching raw_id
        def find_element(elem: Element, target_id: str) -> Element | None:
            if elem.get("raw_id") == target_id:
                return elem
            for child in elem:
                result = find_element(child, target_id)
                if result is not None:
                    return result
            return None

        search_root = root if not wrapped else root
        target_elem = find_element(search_root, str(raw_id))

        if target_elem is None:
            # If not found, return original tree
            return self

        # Convert the scoped element back to XML string
        indent(target_elem)
        scoped_xml = tostring(target_elem, encoding="unicode")

        return self._from_xml(scoped_xml)
