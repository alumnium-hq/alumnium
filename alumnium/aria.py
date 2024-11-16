import logging
from xml.etree.ElementTree import Element, tostring, indent

logger = logging.getLogger(__name__)


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
            elif role_value == "none" or ignored == True:
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
