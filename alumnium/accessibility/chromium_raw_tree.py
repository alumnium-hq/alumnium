from xml.etree.ElementTree import Element, SubElement, fromstring, indent, tostring

from .base_raw_tree import BaseRawTree
from .xcuitest_raw_tree import ElementProperties


class ChromiumRawTree(BaseRawTree):
    def __init__(self, cdp_response: dict):
        self.cdp_response = cdp_response
        self._next_raw_id = 1

    def to_str(self) -> str:
        """Convert CDP response to raw XML format preserving all data."""
        # Reset counter for deterministic raw_id assignment
        self._next_raw_id = 1

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

        return xml_string

    def _get_next_raw_id(self) -> int:
        """Get next sequential raw_id."""
        raw_id = self._next_raw_id
        self._next_raw_id += 1
        return raw_id

    def _node_to_xml(self, node: dict, node_lookup: dict) -> Element:
        """Convert a CDP node to XML element, recursively processing children."""
        # Create element with role as tag
        role = node.get("role", {}).get("value", "unknown")
        elem = Element(role)

        # Add our own sequential raw_id attribute
        elem.set("raw_id", str(self._get_next_raw_id()))

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
                else:
                    elem.set(prop_name, str(prop_value))

        # Process children recursively
        if "childIds" in node:
            for child_id in node["childIds"]:
                if child_id in node_lookup:
                    child_elem = self._node_to_xml(node_lookup[child_id], node_lookup)
                    elem.append(child_elem)

        return elem

    def element_by_id(self, raw_id: int) -> ElementProperties:
        """
        Find element by raw_id and return its properties for element finding.

        Args:
            raw_id: The raw_id to search for

        Returns:
            ElementProperties with backend_node_id set
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

        return ElementProperties(
            type=element.tag,
            backend_node_id=int(backend_node_id_str),
        )
