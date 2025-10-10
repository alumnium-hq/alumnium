from .base_raw_tree import BaseRawTree


class XCUITestRawTree(BaseRawTree):
    def __init__(self, xml_string: str):
        self.xml_string = xml_string

    def to_str(self) -> str:
        return self.xml_string
