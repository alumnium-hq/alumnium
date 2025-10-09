import json

from .base_raw_tree import BaseRawTree


class ChromiumRawTree(BaseRawTree):
    """Raw Chromium accessibility tree (CDP JSON response)."""

    def __init__(self, cdp_response: dict):
        """
        Args:
            cdp_response: Raw CDP Accessibility.getFullAXTree response
        """
        self.cdp_response = cdp_response

    def to_raw(self) -> str:
        """Convert to JSON string for server."""
        return json.dumps(self.cdp_response)

    def platform_name(self) -> str:
        return "chromium"
