from xml.etree.ElementTree import Element, indent, tostring

from .logutils import get_logger

logger = get_logger(__name__)


class AriaTree:
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


import xml.etree.ElementTree as ET


class XCAriaTree:
    def __init__(self, xml_string: str):
        self.tree = None  # Will hold the root node of the processed tree
        self.id_counter = 0
        # Assuming 'logger' is defined in the global scope of this file, like for AriaTree
        # global logger

        try:
            root_element = ET.fromstring(xml_string)
        except ET.ParseError as e:
            # logger.error(f"Failed to parse XML string: {e}")
            raise ValueError(f"Invalid XML string: {e}")

        app_element = None
        if root_element.tag == "AppiumAUT":
            if len(root_element) > 0:
                app_element = root_element[0]
            else:
                # logger.warning("AppiumAUT tag found but it's empty.")
                self.tree = {}
                return
        elif root_element.tag.startswith("XCUIElementType"):
            app_element = root_element
        else:
            # logger.warning(
            # f"Unexpected root tag: {root_element.tag}. Expected AppiumAUT or XCUIElementTypeApplication."
            # )
            self.tree = {}
            return

        if app_element is not None:
            self.tree = self._parse_element(app_element)
        else:
            # logger.warning("No suitable application element found in XML.")
            self.tree = {}

        # logger.debug(
        # f"  -> XCUI ARIA Tree processed. Root: {self.tree.get('role', {}).get('value') if self.tree else 'None'}"
        # )

    def _get_next_id(self):
        self.id_counter += 1
        return self.id_counter

    def _simplify_role(self, xcui_type: str) -> str:
        if xcui_type.startswith("XCUIElementType"):
            simplified = xcui_type[len("XCUIElementType") :]
            # Map "Other" to "generic" to align with potential AriaTree conventions
            if simplified == "Other":
                return "generic"
            return simplified
        return xcui_type

    def _parse_element(self, element: ET.Element) -> dict:
        node_id = self._get_next_id()
        attributes = element.attrib

        raw_type = attributes.get("type", element.tag)
        simplified_role = self._simplify_role(raw_type)

        name_value = attributes.get("label")
        if name_value is None:  # Prefer label
            name_value = attributes.get("name")
        if name_value is None and simplified_role == "StaticText":  # For StaticText, value is often the content
            name_value = attributes.get("value")
        if name_value is None:  # Fallback if all else fails
            name_value = ""

        # An element is considered "ignored" if it's not accessible.
        # This aligns with ARIA principles where accessibility is key.
        ignored = attributes.get("ignored", False)

        properties = []
        # Attributes to extract into the properties list
        # Order can matter for readability or consistency if ever serialized
        prop_xml_attrs = [
            "name",
            "label",
            "value",  # Raw values
            "enabled",
            "visible",
            "accessible",
            "x",
            "y",
            "width",
            "height",
            "index",
        ]

        for xml_attr_name in prop_xml_attrs:
            if xml_attr_name in attributes:
                attr_value = attributes[xml_attr_name]
                # Use a distinct name for raw attributes in properties if they were used for main fields
                prop_name = f"{xml_attr_name}_raw" if xml_attr_name in ["name", "label", "value"] else xml_attr_name

                prop_entry = {"name": prop_name}

                if xml_attr_name in ["enabled", "visible", "accessible"]:
                    prop_entry["value"] = attr_value == "true"
                elif xml_attr_name in ["x", "y", "width", "height", "index"]:
                    try:
                        prop_entry["value"] = int(attr_value)
                    except ValueError:
                        prop_entry["value"] = attr_value
                else:  # Raw name, label, value
                    prop_entry["value"] = attr_value
                properties.append(prop_entry)

        node_dict = {
            "id": node_id,
            "role": {"value": simplified_role},
            "name": {"value": name_value},
            "ignored": ignored,
            "properties": properties,
            "nodes": [],
        }

        for child_element in element:
            child_node = self._parse_element(child_element)
            node_dict["nodes"].append(child_node)

        return node_dict

    def get_tree(self):
        return self.tree

    def to_xml(self) -> str:
        """Converts the processed tree back to an XML string with filtering."""
        if not self.tree:
            return ""

        def convert_dict_to_xml(node_dict: dict) -> ET.Element | None:
            # Filter out ignored elements
            if node_dict.get("ignored", False):
                return None

            # Filter out non-visible elements by checking the 'visible' property
            is_visible = True  # Assume visible if property not found
            for prop in node_dict.get("properties", []):
                if prop.get("name") == "visible":
                    is_visible = prop.get("value", False)
                    break
            if not is_visible:
                return None

            # Use role as the tag name directly
            tag_name = node_dict.get("role", {}).get("value", "generic")
            if not tag_name:  # Should not happen if parsing is correct
                tag_name = "generic"

            xml_attrs = {}
            # Add name (as 'name' attribute) from the 'name' field if present
            name_obj = node_dict.get("name", {})
            name_value = name_obj.get("value")
            if name_value:
                xml_attrs["name"] = name_value

            # Add id attribute
            node_id = node_dict.get("id")
            if node_id is not None:
                xml_attrs["id"] = str(node_id)

            # Properties to include (excluding those explicitly filtered out)
            # and also excluding those already handled (like 'name', 'id', 'visible', 'ignored')
            allowed_properties = ["enabled", "value"]
            # Note: 'value' from properties is different from 'name.value'
            # It usually refers to the 'value' attribute of an XCUIElement

            properties = node_dict.get("properties", [])
            for prop in properties:
                prop_name = prop.get("name")
                if prop_name in allowed_properties:
                    prop_value = prop.get("value")
                    if prop_name == "enabled":
                        if not prop_value:  # Only add enabled="false"
                            xml_attrs[prop_name] = "false"
                    elif prop_value is not None:  # For 'value' and any other allowed props
                        xml_attrs[prop_name] = str(prop_value)

            element = ET.Element(tag_name, xml_attrs)

            # Add children recursively
            for child_node_dict in node_dict.get("nodes", []):
                child_element = convert_dict_to_xml(child_node_dict)
                if child_element is not None:
                    element.append(child_element)

            # Handle text content for StaticText, if its name_value is the text.
            # This is a common pattern for ARIA-like trees.
            if tag_name == "StaticText" and name_value and not list(element):
                # If it's StaticText, has a name, and no children, set its text to name_value.
                # This assumes name_value is the actual text content for StaticText.
                element.text = name_value
                # Remove name attribute if it's now text, to avoid redundancy, unless desired.
                if "name" in xml_attrs and xml_attrs["name"] == name_value:
                    # Element attributes are already set, need to modify 'element' directly
                    if "name" in element.attrib:
                        del element.attrib["name"]

            # Prune empty generic elements
            if tag_name == "generic":
                has_significant_attributes = False
                if element.attrib.get("name") or element.attrib.get("value"):  # Check for name or value attribute
                    has_significant_attributes = True

                if not has_significant_attributes and not element.text and not list(element):
                    return None

            return element

        root_xml_element = convert_dict_to_xml(self.tree)

        if root_xml_element is None:
            return ""  # Root itself was filtered out

        indent(root_xml_element)
        xml_string = tostring(root_xml_element, encoding="unicode")
        return xml_string


# Example Usage (can be placed in if __name__ == "__main__": block)
# if __name__ == "__main__":
#     xml_data = """
# <?xml version="1.0" encoding="UTF-8"?>
# <AppiumAUT>
#   <XCUIElementTypeApplication type="XCUIElementTypeApplication" name="TestApp" label="TestApp"
#     enabled="true" visible="true" accessible="true" x="0" y="0" width="393" height="852" index="0">
#     <XCUIElementTypeButton type="XCUIElementTypeButton" name="click_me" label="Click Me"
#       enabled="true" visible="true" accessible="true" x="10" y="10" width="100" height="50" index="0"/>
#     <XCUIElementTypeOther type="XCUIElementTypeOther" name="container" accessible="false" visible="true">
#       <XCUIElementTypeStaticText type="XCUIElementTypeStaticText" value="Hello" label="Greeting"
#         accessible="true" visible="true"/>
#     </XCUIElementTypeOther>
#   </XCUIElementTypeApplication>
# </AppiumAUT>
# """
#     xc_aria_tree = XCAriaTree(xml_data)
#     processed_tree = xc_aria_tree.get_tree()
#     import json
#     print(json.dumps(processed_tree, indent=2))
#
#     # To use the logger from the file:
#     # Make sure logger is initialized before XCAriaTree is instantiated.
#     # For example, if ALUMNIUM_LOG_PATH is set:
#     # if ALUMNIUM_LOG_PATH == "stdout":
#     #     logger = console_output()
#     # else:
#     #     logger = file_output()
#     # logger.info("XCAriaTree processing complete.")


if __name__ == "__main__":
    tree = {
        "nodes": [
            {
                "backendDOMNodeId": 7,
                "childIds": ["6"],
                "chromeRole": {"type": "internalRole", "value": 144},
                "frameId": "8EB38491F78EBE929C9A606A38DC9F24",
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {
                            "attribute": "aria-label",
                            "superseded": True,
                            "type": "attribute",
                        },
                        {
                            "nativeSource": "title",
                            "type": "relatedElement",
                            "value": {
                                "type": "computedString",
                                "value": "TodoMVC: React",
                            },
                        },
                        {"attribute": "title", "superseded": True, "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "TodoMVC: React",
                },
                "nodeId": "7",
                "properties": [
                    {
                        "name": "focusable",
                        "value": {"type": "booleanOrUndefined", "value": True},
                    }
                ],
                "role": {"type": "internalRole", "value": "RootWebArea"},
            },
            {
                "backendDOMNodeId": 6,
                "childIds": ["5"],
                "chromeRole": {"type": "internalRole", "value": 0},
                "ignored": True,
                "ignoredReasons": [
                    {
                        "name": "uninteresting",
                        "value": {"type": "boolean", "value": True},
                    }
                ],
                "nodeId": "6",
                "parentId": "7",
                "role": {"type": "role", "value": "none"},
            },
            {
                "backendDOMNodeId": 5,
                "childIds": ["4", "16"],
                "chromeRole": {"type": "internalRole", "value": 0},
                "ignored": True,
                "ignoredReasons": [
                    {
                        "name": "uninteresting",
                        "value": {"type": "boolean", "value": True},
                    }
                ],
                "nodeId": "5",
                "parentId": "6",
                "role": {"type": "role", "value": "none"},
            },
            {
                "backendDOMNodeId": 4,
                "childIds": ["30", "19", "48"],
                "chromeRole": {"type": "internalRole", "value": 211},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "4",
                "parentId": "5",
                "properties": [],
                "role": {"type": "role", "value": "generic"},
            },
            {
                "backendDOMNodeId": 16,
                "childIds": ["9", "11", "15"],
                "chromeRole": {"type": "internalRole", "value": 85},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "16",
                "parentId": "5",
                "properties": [],
                "role": {"type": "role", "value": "contentinfo"},
            },
            {
                "backendDOMNodeId": 30,
                "childIds": ["21", "29"],
                "chromeRole": {"type": "internalRole", "value": 95},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "30",
                "parentId": "4",
                "properties": [],
                "role": {"type": "role", "value": "generic"},
            },
            {
                "backendDOMNodeId": 19,
                "childIds": ["59", "18"],
                "chromeRole": {"type": "internalRole", "value": 118},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "19",
                "parentId": "4",
                "properties": [],
                "role": {"type": "role", "value": "main"},
            },
            {
                "backendDOMNodeId": 48,
                "childIds": ["35", "45", "47"],
                "chromeRole": {"type": "internalRole", "value": 86},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "48",
                "parentId": "4",
                "properties": [],
                "role": {"type": "role", "value": "generic"},
            },
            {
                "backendDOMNodeId": 9,
                "childIds": ["8"],
                "chromeRole": {"type": "internalRole", "value": 133},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "9",
                "parentId": "16",
                "properties": [],
                "role": {"type": "role", "value": "paragraph"},
            },
            {
                "backendDOMNodeId": 11,
                "childIds": ["10"],
                "chromeRole": {"type": "internalRole", "value": 133},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "11",
                "parentId": "16",
                "properties": [],
                "role": {"type": "role", "value": "paragraph"},
            },
            {
                "backendDOMNodeId": 15,
                "childIds": ["12", "14"],
                "chromeRole": {"type": "internalRole", "value": 133},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "15",
                "parentId": "16",
                "properties": [],
                "role": {"type": "role", "value": "paragraph"},
            },
            {
                "backendDOMNodeId": 21,
                "childIds": ["20"],
                "chromeRole": {"type": "internalRole", "value": 96},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "todos"},
                        },
                        {"attribute": "title", "superseded": True, "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "todos",
                },
                "nodeId": "21",
                "parentId": "30",
                "properties": [{"name": "level", "value": {"type": "integer", "value": 1}}],
                "role": {"type": "role", "value": "heading"},
            },
            {
                "backendDOMNodeId": 29,
                "childIds": ["26", "28"],
                "chromeRole": {"type": "internalRole", "value": 88},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "29",
                "parentId": "30",
                "properties": [],
                "role": {"type": "role", "value": "generic"},
            },
            {
                "backendDOMNodeId": 59,
                "childIds": ["55", "58"],
                "chromeRole": {"type": "internalRole", "value": 88},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "59",
                "parentId": "19",
                "properties": [],
                "role": {"type": "role", "value": "generic"},
            },
            {
                "backendDOMNodeId": 18,
                "childIds": ["54", "68"],
                "chromeRole": {"type": "internalRole", "value": 111},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "18",
                "parentId": "19",
                "properties": [],
                "role": {"type": "role", "value": "list"},
            },
            {
                "backendDOMNodeId": 35,
                "childIds": ["34"],
                "chromeRole": {"type": "internalRole", "value": 0},
                "ignored": True,
                "ignoredReasons": [
                    {
                        "name": "uninteresting",
                        "value": {"type": "boolean", "value": True},
                    }
                ],
                "nodeId": "35",
                "parentId": "48",
                "role": {"type": "role", "value": "none"},
            },
            {
                "backendDOMNodeId": 34,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {
                                "type": "computedString",
                                "value": "1 item left!",
                            },
                        }
                    ],
                    "type": "computedString",
                    "value": "1 item left!",
                },
                "nodeId": "34",
                "parentId": "35",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 45,
                "childIds": ["38", "41", "44"],
                "chromeRole": {"type": "internalRole", "value": 111},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "45",
                "parentId": "48",
                "properties": [],
                "role": {"type": "role", "value": "list"},
            },
            {
                "backendDOMNodeId": 47,
                "childIds": ["46"],
                "chromeRole": {"type": "internalRole", "value": 9},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"nativeSource": "label", "type": "relatedElement"},
                        {
                            "type": "contents",
                            "value": {
                                "type": "computedString",
                                "value": "Clear completed",
                            },
                        },
                        {"attribute": "title", "superseded": True, "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "Clear completed",
                },
                "nodeId": "47",
                "parentId": "48",
                "properties": [
                    {"name": "invalid", "value": {"type": "token", "value": "false"}},
                    {
                        "name": "focusable",
                        "value": {"type": "booleanOrUndefined", "value": True},
                    },
                ],
                "role": {"type": "role", "value": "button"},
            },
            {
                "backendDOMNodeId": 8,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {
                                "type": "computedString",
                                "value": "Double-click to edit a todo",
                            },
                        }
                    ],
                    "type": "computedString",
                    "value": "Double-click to edit a todo",
                },
                "nodeId": "8",
                "parentId": "9",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 10,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {
                                "type": "computedString",
                                "value": "Created by the TodoMVC Team",
                            },
                        }
                    ],
                    "type": "computedString",
                    "value": "Created by the TodoMVC Team",
                },
                "nodeId": "10",
                "parentId": "11",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 12,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "Part of "},
                        }
                    ],
                    "type": "computedString",
                    "value": "Part of ",
                },
                "nodeId": "12",
                "parentId": "15",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 14,
                "childIds": ["13"],
                "chromeRole": {"type": "internalRole", "value": 110},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "TodoMVC"},
                        },
                        {"attribute": "title", "superseded": True, "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "TodoMVC",
                },
                "nodeId": "14",
                "parentId": "15",
                "properties": [
                    {
                        "name": "focusable",
                        "value": {"type": "booleanOrUndefined", "value": True},
                    }
                ],
                "role": {"type": "role", "value": "link"},
            },
            {
                "backendDOMNodeId": 20,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "todos"},
                        }
                    ],
                    "type": "computedString",
                    "value": "todos",
                },
                "nodeId": "20",
                "parentId": "21",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 26,
                "childIds": ["23", "24"],
                "chromeRole": {"type": "internalRole", "value": 170},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {
                            "nativeSource": "labelfor",
                            "nativeSourceValue": {
                                "relatedNodes": [{"backendDOMNodeId": 28, "text": "New Todo Input"}],
                                "type": "nodeList",
                            },
                            "type": "relatedElement",
                            "value": {
                                "type": "computedString",
                                "value": "New Todo Input",
                            },
                        },
                        {"attribute": "title", "superseded": True, "type": "attribute"},
                        {
                            "attribute": "placeholder",
                            "attributeValue": {
                                "type": "string",
                                "value": "What needs to be done?",
                            },
                            "superseded": True,
                            "type": "placeholder",
                            "value": {
                                "type": "computedString",
                                "value": "What needs to be done?",
                            },
                        },
                        {
                            "attribute": "aria-placeholder",
                            "superseded": True,
                            "type": "placeholder",
                        },
                        {"attribute": "title", "superseded": True, "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "New Todo Input",
                },
                "nodeId": "26",
                "parentId": "29",
                "properties": [
                    {"name": "invalid", "value": {"type": "token", "value": "false"}},
                    {
                        "name": "focusable",
                        "value": {"type": "booleanOrUndefined", "value": True},
                    },
                    {
                        "name": "editable",
                        "value": {"type": "token", "value": "plaintext"},
                    },
                    {
                        "name": "settable",
                        "value": {"type": "booleanOrUndefined", "value": True},
                    },
                    {"name": "multiline", "value": {"type": "boolean", "value": False}},
                    {"name": "readonly", "value": {"type": "boolean", "value": False}},
                    {"name": "required", "value": {"type": "boolean", "value": False}},
                    {
                        "name": "labelledby",
                        "value": {
                            "relatedNodes": [{"backendDOMNodeId": 28, "text": "New Todo Input"}],
                            "type": "nodeList",
                        },
                    },
                ],
                "role": {"type": "role", "value": "textbox"},
            },
            {
                "backendDOMNodeId": 28,
                "childIds": ["27"],
                "chromeRole": {"type": "internalRole", "value": 104},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "28",
                "parentId": "29",
                "properties": [],
                "role": {"type": "internalRole", "value": "LabelText"},
            },
            {
                "backendDOMNodeId": 55,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 14},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"nativeSource": "label", "type": "relatedElement"},
                        {"type": "contents"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "55",
                "parentId": "59",
                "properties": [
                    {"name": "invalid", "value": {"type": "token", "value": "false"}},
                    {
                        "name": "focusable",
                        "value": {"type": "booleanOrUndefined", "value": True},
                    },
                    {
                        "name": "checked",
                        "value": {"type": "tristate", "value": "false"},
                    },
                ],
                "role": {"type": "role", "value": "checkbox"},
            },
            {
                "backendDOMNodeId": 58,
                "childIds": ["56", "57"],
                "chromeRole": {"type": "internalRole", "value": 104},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "58",
                "parentId": "59",
                "properties": [],
                "role": {"type": "internalRole", "value": "LabelText"},
            },
            {
                "backendDOMNodeId": 54,
                "childIds": ["53"],
                "chromeRole": {"type": "internalRole", "value": 115},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "54",
                "parentId": "18",
                "properties": [{"name": "level", "value": {"type": "integer", "value": 1}}],
                "role": {"type": "role", "value": "listitem"},
            },
            {
                "backendDOMNodeId": 68,
                "childIds": ["67"],
                "chromeRole": {"type": "internalRole", "value": 115},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "68",
                "parentId": "18",
                "properties": [{"name": "level", "value": {"type": "integer", "value": 1}}],
                "role": {"type": "role", "value": "listitem"},
            },
            {
                "backendDOMNodeId": 38,
                "childIds": ["37"],
                "chromeRole": {"type": "internalRole", "value": 115},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "38",
                "parentId": "45",
                "properties": [{"name": "level", "value": {"type": "integer", "value": 1}}],
                "role": {"type": "role", "value": "listitem"},
            },
            {
                "backendDOMNodeId": 41,
                "childIds": ["40"],
                "chromeRole": {"type": "internalRole", "value": 115},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "41",
                "parentId": "45",
                "properties": [{"name": "level", "value": {"type": "integer", "value": 1}}],
                "role": {"type": "role", "value": "listitem"},
            },
            {
                "backendDOMNodeId": 44,
                "childIds": ["43"],
                "chromeRole": {"type": "internalRole", "value": 115},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "44",
                "parentId": "45",
                "properties": [{"name": "level", "value": {"type": "integer", "value": 1}}],
                "role": {"type": "role", "value": "listitem"},
            },
            {
                "backendDOMNodeId": 46,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {
                                "type": "computedString",
                                "value": "Clear completed",
                            },
                        }
                    ],
                    "type": "computedString",
                    "value": "Clear completed",
                },
                "nodeId": "46",
                "parentId": "47",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 13,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "TodoMVC"},
                        }
                    ],
                    "type": "computedString",
                    "value": "TodoMVC",
                },
                "nodeId": "13",
                "parentId": "14",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 23,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 0},
                "ignored": True,
                "ignoredReasons": [],
                "nodeId": "23",
                "parentId": "26",
                "role": {"type": "role", "value": "none"},
            },
            {
                "backendDOMNodeId": 24,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 88},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "24",
                "parentId": "26",
                "properties": [
                    {
                        "name": "editable",
                        "value": {"type": "token", "value": "plaintext"},
                    }
                ],
                "role": {"type": "role", "value": "generic"},
            },
            {
                "backendDOMNodeId": 27,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {
                                "type": "computedString",
                                "value": "New Todo Input",
                            },
                        }
                    ],
                    "type": "computedString",
                    "value": "New Todo Input",
                },
                "nodeId": "27",
                "parentId": "28",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 56,
                "childIds": ["-1000000002"],
                "chromeRole": {"type": "internalRole", "value": 88},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "56",
                "parentId": "58",
                "properties": [],
                "role": {"type": "role", "value": "generic"},
            },
            {
                "backendDOMNodeId": 57,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {
                                "type": "computedString",
                                "value": "Toggle All Input",
                            },
                        }
                    ],
                    "type": "computedString",
                    "value": "Toggle All Input",
                },
                "nodeId": "57",
                "parentId": "58",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 53,
                "childIds": ["49", "51"],
                "chromeRole": {"type": "internalRole", "value": 0},
                "ignored": True,
                "ignoredReasons": [
                    {
                        "name": "uninteresting",
                        "value": {"type": "boolean", "value": True},
                    }
                ],
                "nodeId": "53",
                "parentId": "54",
                "role": {"type": "role", "value": "none"},
            },
            {
                "backendDOMNodeId": 49,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 14},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"nativeSource": "label", "type": "relatedElement"},
                        {"type": "contents"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "49",
                "parentId": "53",
                "properties": [
                    {"name": "invalid", "value": {"type": "token", "value": "false"}},
                    {
                        "name": "focusable",
                        "value": {"type": "booleanOrUndefined", "value": True},
                    },
                    {
                        "name": "focused",
                        "value": {"type": "booleanOrUndefined", "value": True},
                    },
                    {"name": "checked", "value": {"type": "tristate", "value": "true"}},
                ],
                "role": {"type": "role", "value": "checkbox"},
            },
            {
                "backendDOMNodeId": 51,
                "childIds": ["50"],
                "chromeRole": {"type": "internalRole", "value": 104},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "51",
                "parentId": "53",
                "properties": [],
                "role": {"type": "internalRole", "value": "LabelText"},
            },
            {
                "backendDOMNodeId": 67,
                "childIds": ["63", "65"],
                "chromeRole": {"type": "internalRole", "value": 0},
                "ignored": True,
                "ignoredReasons": [
                    {
                        "name": "uninteresting",
                        "value": {"type": "boolean", "value": True},
                    }
                ],
                "nodeId": "67",
                "parentId": "68",
                "role": {"type": "role", "value": "none"},
            },
            {
                "backendDOMNodeId": 63,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 14},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"nativeSource": "label", "type": "relatedElement"},
                        {"type": "contents"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "63",
                "parentId": "67",
                "properties": [
                    {"name": "invalid", "value": {"type": "token", "value": "false"}},
                    {
                        "name": "focusable",
                        "value": {"type": "booleanOrUndefined", "value": True},
                    },
                    {
                        "name": "checked",
                        "value": {"type": "tristate", "value": "false"},
                    },
                ],
                "role": {"type": "role", "value": "checkbox"},
            },
            {
                "backendDOMNodeId": 65,
                "childIds": ["64"],
                "chromeRole": {"type": "internalRole", "value": 104},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {"attribute": "title", "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "",
                },
                "nodeId": "65",
                "parentId": "67",
                "properties": [],
                "role": {"type": "internalRole", "value": "LabelText"},
            },
            {
                "backendDOMNodeId": 37,
                "childIds": ["36"],
                "chromeRole": {"type": "internalRole", "value": 110},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "All"},
                        },
                        {"attribute": "title", "superseded": True, "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "All",
                },
                "nodeId": "37",
                "parentId": "38",
                "properties": [
                    {
                        "name": "focusable",
                        "value": {"type": "booleanOrUndefined", "value": True},
                    }
                ],
                "role": {"type": "role", "value": "link"},
            },
            {
                "backendDOMNodeId": 40,
                "childIds": ["39"],
                "chromeRole": {"type": "internalRole", "value": 110},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "Active"},
                        },
                        {"attribute": "title", "superseded": True, "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "Active",
                },
                "nodeId": "40",
                "parentId": "41",
                "properties": [
                    {
                        "name": "focusable",
                        "value": {"type": "booleanOrUndefined", "value": True},
                    }
                ],
                "role": {"type": "role", "value": "link"},
            },
            {
                "backendDOMNodeId": 43,
                "childIds": ["42"],
                "chromeRole": {"type": "internalRole", "value": 110},
                "ignored": False,
                "name": {
                    "sources": [
                        {"attribute": "aria-labelledby", "type": "relatedElement"},
                        {"attribute": "aria-label", "type": "attribute"},
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "Completed"},
                        },
                        {"attribute": "title", "superseded": True, "type": "attribute"},
                    ],
                    "type": "computedString",
                    "value": "Completed",
                },
                "nodeId": "43",
                "parentId": "44",
                "properties": [
                    {
                        "name": "focusable",
                        "value": {"type": "booleanOrUndefined", "value": True},
                    }
                ],
                "role": {"type": "role", "value": "link"},
            },
            {
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "❯"},
                        }
                    ],
                    "type": "computedString",
                    "value": "❯",
                },
                "nodeId": "-1000000002",
                "parentId": "56",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 50,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "hello"},
                        }
                    ],
                    "type": "computedString",
                    "value": "hello",
                },
                "nodeId": "50",
                "parentId": "51",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 64,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "he"},
                        }
                    ],
                    "type": "computedString",
                    "value": "he",
                },
                "nodeId": "64",
                "parentId": "65",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 36,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "All"},
                        }
                    ],
                    "type": "computedString",
                    "value": "All",
                },
                "nodeId": "36",
                "parentId": "37",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 39,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "Active"},
                        }
                    ],
                    "type": "computedString",
                    "value": "Active",
                },
                "nodeId": "39",
                "parentId": "40",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
            {
                "backendDOMNodeId": 42,
                "childIds": [],
                "chromeRole": {"type": "internalRole", "value": 158},
                "ignored": False,
                "name": {
                    "sources": [
                        {
                            "type": "contents",
                            "value": {"type": "computedString", "value": "Completed"},
                        }
                    ],
                    "type": "computedString",
                    "value": "Completed",
                },
                "nodeId": "42",
                "parentId": "43",
                "properties": [],
                "role": {"type": "internalRole", "value": "StaticText"},
            },
        ]
    }

    print(AriaTree(tree).to_xml())
