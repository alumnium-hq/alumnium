"""Raw accessibility tree wrapper for client-side usage."""


class RawAccessibilityTree:
    """
    Simple wrapper for raw accessibility tree data.
    All processing is done server-side.
    """

    def __init__(self, raw_data: dict | str, automation_type: str):
        """
        Args:
            raw_data: Raw accessibility tree data (CDP dict for Chromium, XML string for XCUITest/UIAutomator2)
            automation_type: Type of automation - "chromium", "xcuitest", or "uiautomator2"
        """
        self.raw_data = raw_data
        self.automation_type = automation_type

    def filter_to_area(self, area_id: int) -> "RawAccessibilityTree":
        """Create a new RawAccessibilityTree filtered to only include the subtree at area_id.

        Args:
            area_id: The ID of the area to filter to

        Returns:
            A new RawAccessibilityTree containing only the subtree
        """
        if self.automation_type == "chromium":
            filtered_data = self._filter_chromium_tree(area_id)
        elif self.automation_type in ["xcuitest", "uiautomator2"]:
            filtered_data = self._filter_xml_tree(area_id)
        else:
            # Unknown type, return full tree
            filtered_data = self.raw_data

        return RawAccessibilityTree(filtered_data, self.automation_type)

    def _filter_chromium_tree(self, area_id: int) -> dict:
        """Filter Chromium CDP tree to only include subtree at area_id."""
        import copy

        # Make a deep copy to avoid modifying the original data
        raw_data_copy = copy.deepcopy(self.raw_data)

        # Build a simplified tree first to get IDs assigned
        from ..server.accessibility import ServerChromiumTree

        temp_tree = ServerChromiumTree(raw_data_copy)
        id_to_node_id = {}

        # Map our cached IDs to original nodeIds (use original, not the copy)
        nodes = self.raw_data["nodes"]
        node_lookup = {node["nodeId"]: node for node in nodes}

        # We need to rebuild the ID assignment to find which nodeId corresponds to area_id
        id_counter = 0
        for node_id, node in node_lookup.items():
            parent_id = node.get("parentId")
            if parent_id is None or parent_id in node_lookup:
                id_counter += 1
                id_to_node_id[id_counter] = node_id

        if area_id not in id_to_node_id:
            # Area ID not found, return full tree
            return self.raw_data

        area_node_id = id_to_node_id[area_id]
        area_node = node_lookup[area_node_id]

        # Collect all node IDs in the subtree
        subtree_node_ids = set()

        def collect_node_ids(node_id):
            subtree_node_ids.add(node_id)
            node = node_lookup.get(node_id)
            if node:
                for child_id in node.get("childIds", []):
                    if child_id in node_lookup:
                        collect_node_ids(child_id)

        collect_node_ids(area_node_id)

        # Filter nodes to only those in the subtree (make copies to avoid modifying original)
        filtered_nodes = []
        for node in nodes:
            if node["nodeId"] in subtree_node_ids:
                node_copy = copy.deepcopy(node)
                # Remove any previously assigned IDs from temp processing
                node_copy.pop("id", None)
                # Update parent references - make area_node the root
                if node_copy["nodeId"] == area_node_id:
                    node_copy.pop("parentId", None)
                filtered_nodes.append(node_copy)

        return {"nodes": filtered_nodes}

    def _filter_xml_tree(self, area_id: int) -> str:
        """Filter XML tree (XCUITest or UIAutomator2) to only include subtree at area_id."""
        from xml.etree.ElementTree import fromstring, tostring

        # Parse the tree and assign IDs
        try:
            if self.automation_type == "xcuitest":
                root_element = fromstring(self.raw_data)
                if root_element.tag == "AppiumAUT" and len(root_element) > 0:
                    root_element = root_element[0]
            else:  # uiautomator2
                import re

                xml_declaration_pattern = re.compile(r"^\s*<\?xml.*\?>\s*$")
                lines = self.raw_data.splitlines()
                cleaned_lines = [line for line in lines if not xml_declaration_pattern.match(line)]
                cleaned_xml_content = "\n".join(cleaned_lines)
                wrapped_xml_string = f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n<root>\n{cleaned_xml_content}\n</root>"
                root_element = fromstring(wrapped_xml_string)
        except Exception:
            # If parsing fails, return original tree
            return self.raw_data

        # Assign IDs and find the area element
        id_counter = [0]
        id_to_element = {}

        def assign_ids(element):
            id_counter[0] += 1
            element_id = id_counter[0]
            id_to_element[element_id] = element
            for child in element:
                assign_ids(child)

        assign_ids(root_element)

        if area_id not in id_to_element:
            # Area ID not found, return full tree
            return self.raw_data

        # Get the area element and convert to string
        area_element = id_to_element[area_id]
        return tostring(area_element, encoding="unicode")
