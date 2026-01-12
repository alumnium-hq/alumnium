from abc import ABC, abstractmethod
from re import sub

from ..accessibility import BaseAccessibilityTree
from . import Element
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

    @abstractmethod
    def back(self):
        pass

    @abstractmethod
    def visit(self, url: str):
        pass

    @property
    @abstractmethod
    def screenshot(self) -> str:
        pass

    @abstractmethod
    def scroll_to(self, id: int):
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
    def find_element(self, id: int) -> Element:
        pass

    @abstractmethod
    def execute_script(self, script: str):
        pass

    def _normalize_input_text(self, input_type: str | None, text: str) -> str:
        # Planner often attempts to "escape" file paths by adding backslashes
        if input_type == "file":
            text = sub(r"\+/", "/", text)

        return text
