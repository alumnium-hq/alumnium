from abc import ABC, abstractmethod
from .accessibility_element import AccessibilityElement


class BaseAccessibilityTree(ABC):
    @abstractmethod
    def to_xml(self) -> str:
        pass

    @abstractmethod
    def element_by_id(self, id: int) -> AccessibilityElement:
        pass
