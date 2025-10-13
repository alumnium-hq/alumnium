from abc import ABC, abstractmethod
from xml.etree.ElementTree import Element, fromstring, indent, tostring


class BaseAccessibilityTree(ABC):
    @abstractmethod
    def to_str(self) -> str:
        pass

    @abstractmethod
    def scope_to_area(self, raw_id: int) -> "BaseAccessibilityTree":
        pass
