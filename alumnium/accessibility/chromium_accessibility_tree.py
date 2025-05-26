from xml.etree.ElementTree import Element, indent, tostring

from alumnium.logutils import ALUMNIUM_LOG_PATH, console_output, file_output

if ALUMNIUM_LOG_PATH == "stdout":
    logger = console_output()
else:
    logger = file_output()


class ChromiumAccessibilityTree:
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

        logger.debug(f"  -> ARIA Cached IDs: {self.cached_ids}")

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
        root_elements = [convert_node_to_xml(self.tree[root_id]) for root_id in self.tree]

        # Convert the XML elements to a string
        xml_string = ""
        for element in root_elements:
            indent(element)
            xml_string += tostring(element, encoding="unicode")

        logger.debug(f"  -> ARIA XML: {xml_string}")

        return xml_string
