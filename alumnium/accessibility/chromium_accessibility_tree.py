from typing import List
from xml.etree.ElementTree import Element, indent, tostring

from alumnium.logutils import get_logger

from .accessibility_element import AccessibilityElement
from .base_accessibility_tree import BaseAccessibilityTree

logger = get_logger(__name__)


class ChromiumAccessibilityTree(BaseAccessibilityTree):
    def __init__(self, tree: dict):
        self.tree = {}  # Initialize the result dictionary

        self.id = 0
        self.cached_ids = {}

        nodes = tree["nodes"]
        # Create a lookup table for nodes by their ID
        node_lookup = {node["nodeId"]: node for node in nodes}

        for node_id, node in node_lookup.items():
            parent_id = node.get("parentId")  # Get the parent ID

            self.id += 1
            self.cached_ids[self.id] = node.get("backendDOMNodeId", "")
            node["id"] = self.id

            # If it's a top-level node, add it directly to the tree
            if parent_id is None:
                self.tree[node_id] = node
            else:
                # Find the parent node and add the current node as a child
                parent = node_lookup[parent_id]

                # Initialize the "children" list if it doesn't exist
                parent.setdefault("nodes", []).append(node)

                # Remove unneeded attributes
                node.pop("childIds", None)
                node.pop("parentId", None)

        logger.debug(f"  -> Cached IDs: {self.cached_ids}")

    def element_by_id(self, id: int) -> AccessibilityElement:
        return AccessibilityElement(id=self.cached_ids[id])

    def get_area(self, id: int) -> "ChromiumAccessibilityTree":
        if id not in self.cached_ids:
            raise KeyError(f"No element with id={id}")

        # Create a new tree for the specific area
        root_elements = [self.tree[root_id] for root_id in self.tree]

        def find_node_by_id(nodes, target_id):
            for node in nodes:
                if node.get("id") == target_id:
                    return node
                children = node.get("nodes", [])
                result = find_node_by_id(children, target_id)
                if result:
                    return result
            return None

        target_node = find_node_by_id(root_elements, id)
        if not target_node:
            raise KeyError(f"No node with id={id} found in the tree")

        area_tree = ChromiumAccessibilityTree({"nodes": []})
        area_tree.tree = {id: target_node}  # Set the target node as the root of the new tree
        area_tree.cached_ids = self.cached_ids.copy()  # Copy cached IDs for this area
        return area_tree

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

            if role_value == "StaticText":
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
