from .base_raw_tree import BaseRawTree


class UIAutomator2RawTree(BaseRawTree):
    def __init__(self, xml_string: str):
        self.xml_string = xml_string

    def to_raw(self) -> str:
        return self.xml_string

    def platform_name(self) -> str:
        return "uiautomator2"
