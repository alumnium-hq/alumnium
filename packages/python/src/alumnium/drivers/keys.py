from enum import Enum


class Key(str, Enum):
    BACKSPACE = "Backspace"
    ENTER = "Enter"
    ESCAPE = "Escape"
    SPACE = "Space"
    TAB = "Tab"
    ARROW_DOWN = "ArrowDown"
    ARROW_UP = "ArrowUp"
    ARROW_LEFT = "ArrowLeft"
    ARROW_RIGHT = "ArrowRight"
