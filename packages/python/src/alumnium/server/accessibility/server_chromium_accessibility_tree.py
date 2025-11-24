from typing import List
from xml.etree.ElementTree import Element, fromstring, indent, tostring

from ..logutils import get_logger
from .base_server_accessibility_tree import BaseServerAccessibilityTree

logger = get_logger(__name__)


class ServerChromiumAccessibilityTree(BaseServerAccessibilityTree):
    def __init__(self, raw_xml: str):
        super().__init__()
        self.tree = {}  # Initialize the result dictionary

        # Parse the raw XML
        try:
            root = fromstring(raw_xml)
            roots = [root]
        except Exception:
            # Multiple root elements
            wrapper = fromstring(f"<root>{raw_xml}</root>")
            roots = list(wrapper)

        # Process each root element
        for root_elem in roots:
            node = self._xml_to_node(root_elem)
            # Use backendDOMNodeId as the key
            node_id = node.get("backendDOMNodeId", id(node))
            self.tree[node_id] = node

        logger.debug(f"  -> Simplified to Raw ID mapping: {self._simplified_to_raw_id}")

    def _xml_to_node(self, elem: Element) -> dict:
        """Convert XML element to node dict structure with simplified IDs."""
        # Assign simplified ID
        simplified_id = self._get_next_id()

        # Map to raw_id attribute
        raw_id = elem.get("raw_id", "")
        if raw_id:
            self._simplified_to_raw_id[simplified_id] = int(raw_id)

        node = {
            "id": simplified_id,
            "role": {"value": elem.tag},
            "ignored": elem.get("ignored", "False") == "True",
        }

        # Add name if present
        if elem.get("name"):
            node["name"] = {"value": elem.get("name")}

        # Add properties from other attributes
        properties = []
        for attr_name, attr_value in elem.attrib.items():
            if attr_name not in ["backendDOMNodeId", "nodeId", "ignored", "name", "raw_id"]:
                properties.append({"name": attr_name, "value": {"value": attr_value}})

        if properties:
            node["properties"] = properties

        # Process children recursively
        children = []
        for child_elem in elem:
            child_node = self._xml_to_node(child_elem)
            children.append(child_node)

        if children:
            node["nodes"] = children

        return node

    def to_xml(self):
        """Converts the nested tree to XML format using role.value as tags."""

        def convert_node_to_xml(node, parent=None):
            # Extract the desired information
            role_value = node["role"]["value"]
            id = node.get("id", "")
            ignored = node.get("ignored", False)
            name_value = node.get("name", {}).get("value", "")
            properties = node.get("properties", [])
            children = node.get("nodes", [])

            if role_value == "StaticText" and parent is not None:
                if parent.text:
                    parent.text += name_value
                else:
                    parent.text = name_value
            elif role_value == "none" or ignored:
                if children:
                    for child in children:
                        convert_node_to_xml(child, parent)
            elif role_value == "generic" and not children:
                return None
            else:
                # Create the XML element for the node
                xml_element = Element(role_value)

                if name_value:
                    xml_element.set("name", name_value)

                # Assign a unique ID to the element
                xml_element.set("id", str(id))

                if properties:
                    for property in properties:
                        xml_element.set(property["name"], str(property.get("value", {}).get("value", "")))

                # Add children recursively
                if children:
                    for child in children:
                        convert_node_to_xml(child, xml_element)

                if parent is not None:
                    parent.append(xml_element)

                return xml_element

        # Create the root XML element
        root_elements = []
        for root_id in self.tree:
            element = convert_node_to_xml(self.tree[root_id])
            root_elements.append(element)
            self._prune_redundant_name(element)

        # Convert the XML elements to a string
        xml_string = ""
        for element in root_elements:
            indent(element)
            xml_string += tostring(element, encoding="unicode")

        return xml_string

    def _prune_redundant_name(self, node: Element) -> List[str]:
        """
        Recursively traverses the tree, removes redundant name information from parent nodes,
        and returns a list of all content (names) in the current subtree.
        """
        # Remove name if it equals text
        if node.get("name") and node.text and node.get("name") == node.text:
            del node.attrib["name"]

        if not len(node):
            return self._get_texts(node)

        # Recursively process children and gather all descendant content
        descendant_content = []
        for child in node:
            descendant_content.extend(self._prune_redundant_name(child))

        # Sort by length, longest first, to handle overlapping substrings correctly
        descendant_content.sort(key=len, reverse=True)

        for content in descendant_content:
            if node.get("name"):
                node.set("name", node.get("name").replace(content, "").strip())
            if node.get("label"):
                node.set("label", node.get("label").replace(content, "").strip())
            if node.text:
                node.text = node.text.replace(content, "").strip()

        # The content of the current subtree is its own (potentially pruned) name
        # plus all the content from its descendants.
        current_subtree_content = descendant_content
        if node.get("name"):
            current_subtree_content.extend(self._get_texts(node))

        return current_subtree_content

    def _get_texts(self, node: dict) -> List[str]:
        texts = set()
        if node.get("name"):
            texts.add(node.get("name"))
        if node.get("label"):
            texts.add(node.get("label"))
        if node.text:
            texts.add(node.text)

        return list(texts)
