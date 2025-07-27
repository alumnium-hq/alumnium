import re
from dataclasses import dataclass, field
from typing import List, Dict, Any
from xml.etree.ElementTree import fromstring, ParseError, Element, tostring, indent

from .accessibility_element import AccessibilityElement
from .base_accessibility_tree import BaseAccessibilityTree


@dataclass
class Node:
    id: int
    role: str
    ignored: bool
    properties: List[Dict[str, Any]] = field(default_factory=list)
    children: List["Node"] = field(default_factory=list)


class UIAutomator2AccessibiltyTree(BaseAccessibilityTree):
    def __init__(self, xml_string: str):
        self.tree = []
        self.id_counter = 0
        self.cached_ids = {}

        # cleaning multiple xml declaration lines from page source
        xml_declaration_pattern = re.compile(r"^\s*<\?xml.*\?>\s*$")
        lines = xml_string.splitlines()
        cleaned_lines = [line for line in lines if not xml_declaration_pattern.match(line)]
        cleaned_xml_content = "\n".join(cleaned_lines)
        wrapped_xml_string = (
            f"<?xml version='1.0' encoding='UTF-8' standalone='yes' ?>\n <root>\n{cleaned_xml_content}\n</root>"
        )

        try:
            root_element = fromstring(wrapped_xml_string)
        except ParseError as e:
            raise ValueError(f"Invalid XML string: {e}")

        app_element = None

        if len(root_element):
            for children in range(0, len(root_element)):
                app_element = root_element[children]
                self.tree.append(self._parse_element(app_element))

    def get_tree(self):
        return self.tree

    def _get_next_id(self) -> int:
        self.id_counter += 1
        return self.id_counter

    def _parse_element(self, element: Element) -> Node:
        node_id = self._get_next_id()
        attributes = element.attrib
        raw_type = attributes.get("type", element.tag)

        ignored = attributes.get("ignored") == "true"

        properties = []

        prop_xml_attributes = [
            "class",
            "index",
            "width",
            "height",
            "text",
            "resource-id",
            "content-desc",
            "bounds",
            "checkable",
            "checked",
            "clickable",
            "displayed",
            "enabled",
            "focus",
            "focused",
            "focusable",
            "long-clickable",
            "password",
            "selected",
            "scrollable",
        ]

        for xml_attr_name in prop_xml_attributes:
            if xml_attr_name in attributes:
                prop_name = f"{xml_attr_name}"
                prop_entry = {"name": prop_name}

                if xml_attr_name in [
                    "checked",
                    "checkable",
                    "clickable",
                    "displayed",
                    "enabled",
                    "focus",
                    "focused",
                    "focusable",
                    "long-clickable",
                    "password",
                    "selected",
                    "scrollable",
                ]:
                    prop_entry["value"] = attributes[xml_attr_name] == "true"

                elif xml_attr_name in ["index", "width", "height"]:
                    try:
                        prop_entry["value"] = int(attributes[xml_attr_name])
                    except ValueError:
                        prop_entry["value"] = attributes[xml_attr_name]

                elif xml_attr_name in ["resource-id", "content-desc", "bounds"]:
                    prop_entry["value"] = attributes[xml_attr_name]

                elif xml_attr_name in ["class", "text"]:
                    prop_entry["value"] = attributes[xml_attr_name]

                else:
                    prop_entry["value"] = attributes[xml_attr_name]
                properties.append(prop_entry)

        node = Node(id=node_id, role=raw_type, ignored=ignored, properties=properties)

        self.cached_ids[node_id] = node

        for child_element in element:
            node.children.append(self._parse_element(child_element))
        return node

    def element_by_id(self, id) -> AccessibilityElement:
        element = AccessibilityElement(id=id)
        found_node = self.cached_ids.get(id)
        for prop in found_node.properties:
            prop_name, prop_value = prop.get("name"), prop.get("value")
            if prop_name == "class":
                element.type = prop_value
            elif prop_name == "resource-id":
                element.androidresourceid = prop_value
            elif prop_name == "text":
                element.androidtext = prop_value
            elif prop_name == "content-desc":
                element.androidcontentdesc = prop_value
            elif prop_name == "bounds":
                element.androidbounds = prop_value
        return element

    def to_xml(self) -> str:
        if not self.tree:
            return ""

        def convert_dict_to_xml(node: Node) -> Element | None:
            if node.ignored:
                return None

            element = Element(node.role)

            attributes_to_include = ["resource-id", "content-desc", "text"]

            for prop in node.properties:
                if prop["name"] in attributes_to_include:
                    element.set(prop["name"], str(prop["value"]))

            # Recursively convert and append children
            for child_node in node.children:
                child_element = convert_dict_to_xml(child_node)
                if child_element is not None:
                    element.append(child_element)

            return element

        xml_outputs = []
        for root_node in self.tree:
            root_element = convert_dict_to_xml(root_node)
            if root_node is not None:
                indent(root_element)
                xml_outputs.append(tostring(root_element, encoding="unicode"))
        return "\n".join(xml_outputs)
