from abc import ABC, abstractmethod


class BaseAccessibilityTree(ABC):
    def __init__(self):
        self._id_counter = 0
        self._simplified_to_raw_id = {}  # Maps simplified IDs to raw_id

    @abstractmethod
    def to_xml(self) -> str:
        pass

    @abstractmethod
    def get_area(self, id: int) -> "BaseAccessibilityTree":
        pass

    def get_raw_id(self, simplified_id: int) -> int:
        """Map a simplified ID back to raw_id."""
        if simplified_id not in self._simplified_to_raw_id:
            raise KeyError(f"No element with simplified id={simplified_id}")

        return self._simplified_to_raw_id[simplified_id]

    def map_tool_calls_to_raw_id(self, tool_calls: list[dict]) -> list[dict]:
        mapped_calls = []
        for call in tool_calls:
            mapped_call = call.copy()
            args = call.get("args", {}).copy()

            if "id" in args:
                args["id"] = self.get_raw_id(args["id"])
            if "from_id" in args:
                args["from_id"] = self.get_raw_id(args["from_id"])
            if "to_id" in args:
                args["to_id"] = self.get_raw_id(args["to_id"])

            mapped_call["args"] = args
            mapped_calls.append(mapped_call)

        return mapped_calls

    def _get_next_id(self) -> int:
        self._id_counter += 1
        return self._id_counter
