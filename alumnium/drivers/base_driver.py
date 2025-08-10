from abc import ABC, abstractmethod
from contextlib import contextmanager
from typing import Iterator

from alumnium.accessibility import BaseAccessibilityTree

from .keys import Key


class BaseDriver(ABC):
    _accessibility_tree: BaseAccessibilityTree

    @contextmanager
    def capture_accessibility_tree(self, tree: BaseAccessibilityTree = None) -> Iterator[BaseAccessibilityTree]:
        if tree:
            self._accessibility_tree = tree
        else:
            self._accessibility_tree = self._fetch_accessibility_tree()
        try:
            yield self._accessibility_tree
        finally:
            self._accessibility_tree = None

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

    @abstractmethod
    def back(self):
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

    @abstractmethod
    def _fetch_accessibility_tree(self) -> BaseAccessibilityTree:
        pass
