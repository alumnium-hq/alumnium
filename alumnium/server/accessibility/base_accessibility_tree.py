from abc import ABC, abstractmethod


class BaseAccessibilityTree(ABC):
    @abstractmethod
    def to_xml(self) -> str:
        pass

    @abstractmethod
    def get_id_mappings(self) -> dict[int, int]:
        """Returns mapping of cached_id -> backend_id"""
        pass
