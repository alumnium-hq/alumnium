from abc import ABC, abstractmethod
from typing import Any


class BaseAccessibilityTree(ABC):
    """Base class for server-side accessibility trees that handle ID mapping."""

    def __init__(self):
        self.id_counter = 0
        self.simplified_to_raw_id = {}  # Maps simplified IDs to raw_id

    @abstractmethod
    def to_xml(self) -> str:
        """Convert the tree to XML format for agent consumption."""
        pass

    @abstractmethod
    def get_area(self, id: int) -> "BaseAccessibilityTree":
        """Get a subtree starting at the given element ID."""
        pass

    def map_id_to_raw_id(self, simplified_id: int) -> int:
        """Map a simplified ID back to raw_id."""
        if simplified_id not in self.simplified_to_raw_id:
            raise KeyError(f"No element with simplified id={simplified_id}")
        return self.simplified_to_raw_id[simplified_id]

    def map_tool_calls_to_raw_id(self, tool_calls: list[dict]) -> list[dict]:
        """
        Map simplified IDs in tool calls back to raw_id.

        Handles id, from_id, and to_id fields in tool call arguments.
        """
        mapped_calls = []
        for call in tool_calls:
            mapped_call = call.copy()
            args = call.get("args", {}).copy()

            # Map ID fields if present
            if "id" in args:
                args["id"] = self.map_id_to_raw_id(args["id"])
            if "from_id" in args:
                args["from_id"] = self.map_id_to_raw_id(args["from_id"])
            if "to_id" in args:
                args["to_id"] = self.map_id_to_raw_id(args["to_id"])

            mapped_call["args"] = args
            mapped_calls.append(mapped_call)

        return mapped_calls

    def _get_next_id(self) -> int:
        """Get the next sequential simplified ID."""
        self.id_counter += 1
        return self.id_counter
