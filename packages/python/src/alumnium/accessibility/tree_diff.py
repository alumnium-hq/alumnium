from dataclasses import dataclass, field
from typing import Dict, List, Optional
from xml.etree.ElementTree import Element, fromstring, indent, tostring


@dataclass
class NodeChange:
    """Represents a single change in the accessibility tree."""

    change_type: str  # "added", "removed", "modified"
    role: str
    name: Optional[str] = None
    node_id: Optional[str] = None
    details: str = ""  # For modified nodes: what changed


@dataclass
class AccessibilityTreeDiff:
    """Computes and formats diff between two accessibility tree XML strings."""

    before_xml: str
    after_xml: str
    _changes: List[NodeChange] = field(default_factory=list, init=False)
    _computed: bool = field(default=False, init=False)

    # Attributes that indicate state changes worth tracking
    STATE_ATTRIBUTES = frozenset(
        ["value", "checked", "selected", "expanded", "focused", "pressed", "disabled", "invalid"]
    )

    def compute(self) -> str:
        """Compute diff and return LLM-friendly text format."""
        if not self._computed:
            self._changes = self._compute_changes()
            self._computed = True
        return self._format_for_llm()

    def to_list(self) -> List[NodeChange]:
        """Return structured list of changes."""
        if not self._computed:
            self._changes = self._compute_changes()
            self._computed = True
        return self._changes

    def to_xml_diff(self) -> str:
        """Return RFC 5261 XML diff format."""
        if not self._computed:
            self._changes = self._compute_changes()
            self._computed = True
        return self._format_as_xml_diff()

    def _format_as_xml_diff(self) -> str:
        """Format changes as RFC 5261 XML diff."""
        root = Element("diff")
        root.set("xmlns", "urn:ietf:params:xml:ns:pidf-diff")

        for change in self._changes:
            if change.change_type == "removed":
                self._add_remove_operation(root, change)
            elif change.change_type == "added":
                self._add_add_operation(root, change)
            elif change.change_type == "modified":
                self._add_replace_operations(root, change)

        if len(root) == 0:
            return "<diff xmlns=\"urn:ietf:params:xml:ns:pidf-diff\" />"

        indent(root)
        return tostring(root, encoding="unicode")

    def _add_remove_operation(self, parent: Element, change: NodeChange) -> None:
        """Add <remove> element for removed node."""
        remove = Element("remove")
        remove.set("sel", self._build_xpath(change))
        parent.append(remove)

    def _add_add_operation(self, parent: Element, change: NodeChange) -> None:
        """Add <add> element for added node."""
        add = Element("add")
        add.set("sel", "/RootWebArea")
        add.set("pos", "last")
        add.append(self._reconstruct_element(change))
        parent.append(add)

    def _add_replace_operations(self, parent: Element, change: NodeChange) -> None:
        """Add <replace> elements for modified attributes."""
        for attr_change in self._parse_details(change.details):
            replace = Element("replace")
            replace.set("sel", f"{self._build_xpath(change)}/@{attr_change['name']}")
            replace.text = attr_change["new_value"]
            parent.append(replace)

    def _build_xpath(self, change: NodeChange) -> str:
        """Build XPath selector for a node using backendDOMNodeId."""
        if change.node_id:
            return f"//{change.role}[@backendDOMNodeId='{change.node_id}']"
        elif change.name:
            return f"//{change.role}[@name='{change.name}']"
        return f"//{change.role}"

    def _reconstruct_element(self, change: NodeChange) -> Element:
        """Reconstruct XML Element from NodeChange."""
        elem = Element(change.role)
        if change.node_id:
            elem.set("backendDOMNodeId", change.node_id)
        if change.name:
            elem.set("name", change.name)
        return elem

    def _parse_details(self, details: str) -> List[dict]:
        """Parse 'attr: old → new, attr2: old → new' into list of dicts."""
        changes: List[dict] = []
        if not details:
            return changes
        for part in details.split(", "):
            if "→" in part:
                name, values = part.split(": ", 1)
                _, new_val = values.split(" → ")
                changes.append({"name": name.strip(), "new_value": new_val.strip()})
        return changes

    def _compute_changes(self) -> List[NodeChange]:
        before_nodes = self._parse_to_dict(self.before_xml)
        after_nodes = self._parse_to_dict(self.after_xml)

        changes: List[NodeChange] = []

        # Find removed nodes (in before, not in after)
        for key, node in before_nodes.items():
            if key not in after_nodes:
                changes.append(
                    NodeChange(
                        change_type="removed",
                        role=node["role"],
                        name=node.get("name"),
                        node_id=node.get("backendDOMNodeId"),
                    )
                )

        # Find added nodes (in after, not in before)
        for key, node in after_nodes.items():
            if key not in before_nodes:
                changes.append(
                    NodeChange(
                        change_type="added",
                        role=node["role"],
                        name=node.get("name"),
                        node_id=node.get("backendDOMNodeId"),
                    )
                )

        # Find modified nodes (in both, but different state)
        for key, after_node in after_nodes.items():
            if key in before_nodes:
                before_node = before_nodes[key]
                diff_details = self._get_state_diff(before_node, after_node)
                if diff_details:
                    changes.append(
                        NodeChange(
                            change_type="modified",
                            role=after_node["role"],
                            name=after_node.get("name"),
                            node_id=after_node.get("backendDOMNodeId"),
                            details=diff_details,
                        )
                    )

        return changes

    def _parse_to_dict(self, xml_str: str) -> Dict[str, dict]:
        """Parse XML to dict keyed by backendDOMNodeId for matching."""
        if not xml_str or not xml_str.strip():
            return {}

        # Wrap in root element to handle multiple top-level nodes
        try:
            root = fromstring(f"<root>{xml_str}</root>")
        except Exception:
            return {}

        nodes: Dict[str, dict] = {}
        self._collect_nodes(root, nodes)
        return nodes

    def _collect_nodes(self, elem: Element, nodes: Dict[str, dict]) -> None:
        """Recursively collect all nodes from XML tree."""
        # Skip the synthetic root element
        if elem.tag != "root":
            backend_id = elem.get("backendDOMNodeId")
            if backend_id:
                # Use backendDOMNodeId as primary key
                node_data = {
                    "role": elem.tag,
                    "backendDOMNodeId": backend_id,
                    **{k: v for k, v in elem.attrib.items()},
                }
                nodes[backend_id] = node_data

        for child in elem:
            self._collect_nodes(child, nodes)

    def _get_state_diff(self, before: dict, after: dict) -> str:
        """Check if node's state changed and return diff description."""
        diffs: List[str] = []

        # Check name changes
        before_name = before.get("name", "")
        after_name = after.get("name", "")
        if before_name != after_name:
            diffs.append(f'name: "{before_name}" → "{after_name}"')

        # Check state attribute changes
        for attr in self.STATE_ATTRIBUTES:
            before_val = before.get(attr)
            after_val = after.get(attr)
            if before_val != after_val:
                before_display = before_val if before_val is not None else "unset"
                after_display = after_val if after_val is not None else "unset"
                diffs.append(f"{attr}: {before_display} → {after_display}")

        return ", ".join(diffs)

    def _format_for_llm(self) -> str:
        """Format changes as LLM-friendly text."""
        if not self._changes:
            return "No changes detected."

        lines = ["ACCESSIBILITY TREE CHANGES:"]
        added = removed = modified = 0

        for change in self._changes:
            name_part = f' "{change.name}"' if change.name else ""
            id_part = f" (id={change.node_id})" if change.node_id else ""

            if change.change_type == "added":
                lines.append(f"+ Added: {change.role}{name_part}{id_part}")
                added += 1
            elif change.change_type == "removed":
                lines.append(f"- Removed: {change.role}{name_part}{id_part}")
                removed += 1
            elif change.change_type == "modified":
                lines.append(f"~ Modified: {change.role}{name_part}{id_part} [{change.details}]")
                modified += 1

        lines.append(f"\nSummary: {added} added, {removed} removed, {modified} modified")
        return "\n".join(lines)
