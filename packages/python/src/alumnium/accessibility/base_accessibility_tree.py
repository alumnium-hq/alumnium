from abc import ABC, abstractmethod

from .accessibility_element import AccessibilityElement


class BaseAccessibilityTree(ABC):
    @abstractmethod
    def to_str(self) -> str:
        pass

    @abstractmethod
    def element_by_id(self, raw_id: int) -> AccessibilityElement:
        pass

    @abstractmethod
    def scope_to_area(self, raw_id: int) -> "BaseAccessibilityTree":
        pass
