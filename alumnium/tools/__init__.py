from .click_tool import ClickTool
from .drag_and_drop_tool import DragAndDropTool
from .hover_tool import HoverTool
from .press_key_tool import PressKeyTool
from .select_tool import SelectTool
from .type_tool import TypeTool

ALL_TOOLS = {
    "ClickTool": ClickTool,
    "DragAndDropTool": DragAndDropTool,
    "HoverTool": HoverTool,
    "PressKeyTool": PressKeyTool,
    "SelectTool": SelectTool,
    "TypeTool": TypeTool,
}

ALL_APPIUM_TOOLS = {
    "ClickTool": ClickTool,
    "DragAndDropTool": DragAndDropTool,
    "PressKeyTool": PressKeyTool,
    "SelectTool": SelectTool,
    "TypeTool": TypeTool,
}
