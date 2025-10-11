import re
from dataclasses import dataclass, field
from typing import Any, Dict, List
from xml.etree.ElementTree import Element, ParseError, fromstring, indent, tostring

from .base_accessibility_tree import BaseAccessibilityTree


@dataclass
class Node:
    id: int
    role: str
    ignored: bool
    properties: List[Dict[str, Any]] = field(default_factory=list)
    children: List["Node"] = field(default_factory=list)


class UIAutomator2AccessibilityTree(BaseAccessibilityTree):
    def __init__(self, xml_string: str):
        super().__init__()
        self.tree = []
        self.id_to_node = {}

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

        if len(root_element):
            for children in range(0, len(root_element)):
                app_element = root_element[children]
                self.tree.append(self._parse_element(app_element))

    def get_area(self, id: int) -> "UIAutomator2AccessibilityTree":
        if id not in self.id_to_node:
            raise KeyError(f"No element with id={id}")

        # Create a new tree for the specific area
        area_tree = UIAutomator2AccessibilityTree("")
        area_tree.tree = [self.id_to_node[id]]
        area_tree.id_to_node = self.id_to_node.copy()
        area_tree.simplified_to_raw_id = self.simplified_to_raw_id.copy()
        return area_tree

    def _parse_element(self, element: Element) -> Node:
        simplified_id = self._get_next_id()
        attributes = element.attrib
        raw_type = attributes.get("type", element.tag)

        # Extract raw_id attribute
        raw_id = attributes.get("raw_id", "")
        if raw_id:
            raw_id_int = int(raw_id)
            self.simplified_to_raw_id[simplified_id] = raw_id_int

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

        node = Node(id=simplified_id, role=raw_type, ignored=ignored, properties=properties)

        self.id_to_node[simplified_id] = node

        for child_element in element:
            node.children.append(self._parse_element(child_element))
        return node

    def to_xml(self) -> str:
        if not self.tree:
            return ""

        def convert_dict_to_xml(ele: Node, parent_element: Element) -> Element | None:
            if ele.ignored:
                return None

            for child_element in ele.children:
                id = child_element.id
                simplified_role = child_element.role.split(".")[-1]
                resource_id = ""
                content_desc = ""
                text_desc = ""
                clickable = ""

                role = Element(simplified_role)
                role.set("id", str(id))

                for props in child_element.properties:
                    if props["name"] == "resource-id" and props["value"]:
                        resource_id = props["value"]
                    if props["name"] == "content-desc" and props["value"]:
                        content_desc = props["value"]
                    if simplified_role == "TextView":
                        if props["name"] == "text" and props["value"]:
                            text_desc = props["value"]
                    if props["name"] == "clickable" and props["value"]:
                        clickable = True

                if resource_id:
                    role.set("resource-id", resource_id)
                if content_desc:
                    role.set("content-desc", content_desc)
                if text_desc:
                    role.set("text", text_desc)
                if clickable:
                    role.set("clickable", "true")

                parent_element.append(role)
                if child_element.children:
                    convert_dict_to_xml(child_element, role)

        root_xml = Element("hierarchy")
        for ele in self.tree:
            convert_dict_to_xml(ele, root_xml)

        indent(root_xml)

        return tostring(root_xml, "unicode")
