from json import dumps

from .base_raw_tree import BaseRawTree


class ChromiumRawTree(BaseRawTree):
    def __init__(self, cdp_response: dict):
        self.cdp_response = cdp_response

    def to_raw(self) -> str:
        return dumps(self.cdp_response)

    def platform_name(self) -> str:
        return "chromium"
