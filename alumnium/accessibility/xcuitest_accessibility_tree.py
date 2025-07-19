from dataclasses import dataclass, field
from typing import Any, Dict, List
from xml.etree.ElementTree import Element, ParseError, indent, tostring, fromstring

from alumnium.logutils import get_logger
from .accessibility_element import AccessibilityElement
from .base_accessibility_tree import BaseAccessibilityTree

logger = get_logger(__name__)


@dataclass
class Node:
    """A single accessibility node in the parsed hierarchy."""

    id: int
    role: str
    name: str
    ignored: bool
    properties: List[Dict[str, Any]] = field(default_factory=list)
    children: List["Node"] = field(default_factory=list)

    def is_visible(self) -> bool:
        for prop in self.properties:
            if prop["name"] == "visible":
                return bool(prop.get("value"))
        return True


class XCUITestAccessibilityTree(BaseAccessibilityTree):
    def __init__(self, xml_string: str):
        self.tree = None  # Will hold the root node of the processed tree
        self.id_counter = 0
        self.cached_ids = {}
        # Assuming 'logger' is defined in the global scope of this file, like for AriaTree
        # global logger

        try:
            root_element = fromstring(xml_string)
        except ParseError as e:
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

    def get_area(self, id: int) -> "XCUITestAccessibilityTree":
        if id not in self.cached_ids:
            raise KeyError(f"No element with id={id}")

        # Create a new tree for the specific area
        area_tree = XCUITestAccessibilityTree("<AppiumAUT></AppiumAUT>")
        area_tree.tree = self.cached_ids[id]
        area_tree.cached_ids = self.cached_ids.copy()  # Copy cached IDs for this area
        return area_tree

    def _get_next_id(self) -> int:
        self.id_counter += 1
        return self.id_counter

    def _simplify_role(self, xcui_type: str) -> str:
        simple = xcui_type.removeprefix("XCUIElementType")
        return "generic" if simple == "Other" else simple

    def _parse_element(self, element: Element) -> Node:
        node_id = self._get_next_id()
        attributes = element.attrib

        raw_type = attributes.get("type", element.tag)
        simplified_role = self._simplify_role(raw_type)

        name_value = attributes.get("name")
        if name_value is None:  # Prefer label
            name_value = attributes.get("label")
        if name_value is None and simplified_role == "StaticText":  # For StaticText, value is often the content
            name_value = attributes.get("value")
        if name_value is None:  # Fallback if all else fails
            name_value = ""

        # An element is considered "ignored" if it's not accessible.
        # This aligns with ARIA principles where accessibility is key.
        ignored = attributes.get("ignored") == "true"

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

        node = Node(
            id=node_id,
            role=simplified_role,
            name=name_value,
            ignored=ignored,
            properties=properties,
        )
        self.cached_ids[node_id] = node

        for child_element in element:
            node.children.append(self._parse_element(child_element))

        return node

    def get_tree(self) -> dict:
        return self.tree

    def element_by_id(self, id: int) -> AccessibilityElement:
        """Finds an element by its ID and returns its properties (type, name, label, value)."""
        element = AccessibilityElement(id=id)

        found_node = self.cached_ids.get(id)
        if found_node is None:
            raise KeyError(f"No element with id={id}")

        # Reconstruct original XCUIElementType
        simplified_role = found_node.role or "generic"
        if simplified_role == "generic":
            element_type = "XCUIElementTypeOther"
        else:
            element_type = f"XCUIElementType{simplified_role}"
        element.type = element_type

        for prop in found_node.properties:
            prop_name, prop_value = prop.get("name"), prop.get("value")
            if prop_name == "name_raw":
                element.name = prop_value
            elif prop_name == "label_raw":
                element.label = prop_value
            elif prop_name == "value_raw":
                element.value = prop_value

        return element

    def to_xml(self) -> str:
        """Converts the processed tree back to an XML string with filtering and flattening."""
        if not self.tree:
            return ""

        self._prune_redundant_name(self.tree)

        def convert_dict_to_xml(node: Node) -> Element | None:
            # Filter out ignored elements
            if node.ignored:
                return None

            # Recursive flattening of deeply nested structures
            def find_deepest_meaningful_node(current_node):
                valid_children = [n for n in current_node.children if not n.ignored]

                # If generic with only one child and same name, go deeper
                if current_node.role == "generic" and len(valid_children) == 1:
                    child = valid_children[0]
                    parent_name = current_node.name
                    child_name = child.name

                    # If names match exactly or parent contains the entire child name
                    if parent_name == child_name:
                        return find_deepest_meaningful_node(child)
                    elif child_name == "":
                        child.name = parent_name
                        return find_deepest_meaningful_node(child)

                # Return current node if no more flattening possible
                return current_node

            # Get the deepest meaningful node after flattening
            flattened_node = find_deepest_meaningful_node(node)
            if flattened_node != node:
                # If we flattened, process the flattened node instead
                return convert_dict_to_xml(flattened_node)

            # Use role as the tag name directly
            tag_name = node.role or "generic"

            xml_attrs = {"id": str(node.id)}
            # Add name (as 'name' attribute) from the 'name' field if present
            name_value = node.name  # Used for StaticText handling later
            if node.name:  # if node.name is not an empty string
                xml_attrs["name"] = node.name

            # Extract raw label, raw value, and enabled status from properties
            raw_label_val = None
            raw_value_val = None
            is_enabled = True  # Assume true unless "enabled: false" is found

            for prop in node.properties:
                p_name = prop.get("name")
                p_value = prop.get("value")

                if p_name == "label_raw":
                    raw_label_val = str(p_value) if p_value else None
                elif p_name == "value_raw":
                    raw_value_val = str(p_value) if p_value else None
                elif p_name == "enabled":
                    if p_value is False:  # 'enabled' property in Node is boolean
                        is_enabled = False

            current_name_attr_val = xml_attrs.get("name")

            # Add 'label' attribute if raw_label_val exists and is different from current_name_attr_val
            if raw_label_val is not None and raw_label_val != current_name_attr_val:
                xml_attrs["label"] = raw_label_val

            # Add 'value' attribute if raw_value_val exists and is different from:
            # 1. current_name_attr_val (the name attribute value)
            # 2. The value of the 'label' attribute (if 'label' was added)
            if raw_value_val is not None:
                add_value_attr = True
                if raw_value_val == current_name_attr_val:
                    add_value_attr = False

                # Check against the label attribute *if it was added*
                if "label" in xml_attrs and raw_value_val == xml_attrs.get("label"):
                    add_value_attr = False

                if add_value_attr:
                    xml_attrs["value"] = raw_value_val

            # Add 'enabled="false"' if not enabled
            if not is_enabled:
                xml_attrs["enabled"] = "false"

            element = Element(tag_name, xml_attrs)

            # Add children recursively
            for child_node in node.children:
                child_element = convert_dict_to_xml(child_node)
                if child_element is not None:
                    element.append(child_element)

            # Handle text content for StaticText
            if tag_name == "StaticText" and name_value and not list(element):
                element.text = name_value
                # Remove name attribute if it's now text, to avoid redundancy
                if "name" in xml_attrs and xml_attrs["name"] == name_value:
                    if "name" in element.attrib:
                        del element.attrib["name"]

            # Prune empty generic elements
            if tag_name == "generic":
                has_significant_attributes = False
                if element.attrib.get("name") or element.attrib.get("value"):
                    has_significant_attributes = True

                if not has_significant_attributes and not element.text and not list(element):
                    return None

            # Get the deepest meaningful node after flattening
            flattened_node = find_deepest_meaningful_node(node)
            if flattened_node != node:
                # If we flattened, process the flattened node instead
                # We need to re-evaluate the element based on the flattened_node
                # This is a recursive call, ensure it doesn't lead to infinite loops
                # if the flattening logic isn't strictly reductive.
                return convert_dict_to_xml(flattened_node)

            return element

        root_xml_element = convert_dict_to_xml(self.tree)

        if root_xml_element is None:
            return ""  # Root itself was filtered out

        indent(root_xml_element)
        xml_string = tostring(root_xml_element, encoding="unicode")
        return xml_string

    def _prune_redundant_name(self, node: Node) -> List[str]:
        """
        Recursively traverses the tree, removes redundant name information from parent nodes,
        and returns a list of all content (names) in the current subtree.
        """
        if not node.children:
            return self._get_texts(node)

        # Recursively process children and gather all descendant content
        descendant_content = []
        for child in node.children:
            descendant_content.extend(self._prune_redundant_name(child))

        # Sort by length, longest first, to handle overlapping substrings correctly
        descendant_content.sort(key=len, reverse=True)

        for content in descendant_content:
            node.name = node.name.replace(content, "").strip()
            for prop in node.properties:
                if prop["name"] in ["name_raw", "label_raw", "value_raw"]:
                    prop["value"] = prop["value"].replace(content, "").strip()

        # The content of the current subtree is its own (potentially pruned) name
        # plus all the content from its descendants.
        current_subtree_content = descendant_content
        if node.name:
            current_subtree_content.extend(self._get_texts(node))

        return current_subtree_content

    def _get_texts(self, node: Node) -> List[str]:
        texts = set()
        if node.name:
            texts.add(node.name)
        for prop in node.properties:
            if prop["name"] in ["label_raw", "value_raw", "name_raw"] and prop["value"]:
                texts.add(prop["value"])

        return list(texts)
