from xml.etree.ElementTree import ElementTree, Element, ParseError, indent, tostring, fromstring

from alumnium.logutils import get_logger

logger = get_logger(__name__)


class XCUITestAccessibilityTree:
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

    def _parse_element(self, element: Element) -> dict:
        node_id = self._get_next_id()
        self.cached_ids[node_id] = node_id
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

    def _find_node_by_id_recursive(self, node_dict: dict, target_id: int) -> dict | None:
        """Helper to recursively find a node by its integer ID."""
        if node_dict.get("id") == target_id:
            return node_dict
        for child_node in node_dict.get("nodes", []):
            found_node = self._find_node_by_id_recursive(child_node, target_id)
            if found_node:
                return found_node
        return None

    def element_by_id(self, element_id_str: str) -> dict | None:
        """Finds an element by its ID and returns its properties (type, name, label, value)."""
        if not self.tree:
            # logger.debug("element_by_id called on an empty tree.")
            return None
        try:
            target_id = int(element_id_str)
        except ValueError:
            # logger.warning(f"Invalid element ID format: {element_id_str}. Must be an integer string.")
            return None

        found_node = self._find_node_by_id_recursive(self.tree, target_id)

        if not found_node:
            # logger.debug(f"Element with ID '{target_id}' not found in the tree.")
            return None

        # Reconstruct original XCUIElementType
        simplified_role = found_node.get("role", {}).get("value", "generic")
        if simplified_role == "generic":
            element_type = "XCUIElementTypeOther"
        else:
            element_type = f"XCUIElementType{simplified_role}"

        # Extract desired properties (name_raw, label_raw, value_raw)
        result = {"type": element_type, "name": None, "label": None, "value": None}

        for prop in found_node.get("properties", []):
            prop_name = prop.get("name")
            prop_value = prop.get("value")
            if prop_name == "name_raw":
                result["name"] = prop_value
            elif prop_name == "label_raw":
                result["label"] = prop_value
            elif prop_name == "value_raw":
                result["value"] = prop_value

        return result

    def to_xml(self) -> str:
        """Converts the processed tree back to an XML string with filtering."""
        if not self.tree:
            return ""

        def convert_dict_to_xml(node_dict: dict) -> Element | None:
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

            element = Element(tag_name, xml_attrs)

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
