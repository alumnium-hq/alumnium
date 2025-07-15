from abc import ABC, abstractmethod

from alumnium.accessibility import BaseAccessibilityTree

from .keys import Key


class BaseDriver(ABC):
    @property
    @abstractmethod
    def accessibility_tree(self) -> BaseAccessibilityTree:
        pass

    @abstractmethod
    def click(self, id: int):
        pass

    @abstractmethod
    def drag_and_drop(self, from_id: int, to_id: int):
        pass

    @abstractmethod
    def press_key(self, key: Key):
        pass

    @abstractmethod
    def quit(self):
        pass

    @property
    @abstractmethod
    def screenshot(self) -> str:
        pass

    @abstractmethod
    def select(self, id: int, option: str):
        pass

    @property
    @abstractmethod
    def title(self) -> str:
        pass

    @abstractmethod
    def type(self, id: int, text: str):
        pass

    @property
    @abstractmethod
    def url(self) -> str:
        pass
