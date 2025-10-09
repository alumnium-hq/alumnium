from .base_raw_tree import BaseRawTree


class UIAutomator2RawTree(BaseRawTree):
    """Raw UIAutomator2 accessibility tree (XML string)."""

    def __init__(self, xml_string: str):
        """
        Args:
            xml_string: Raw XML page source from Appium/UIAutomator2
        """
        self.xml_string = xml_string

    def to_raw(self) -> str:
        """Return the raw XML string for server."""
        return self.xml_string

    def platform_name(self) -> str:
        return "uiautomator2"
