from json import dumps

from .base_raw_tree import BaseRawTree


class ChromiumRawTree(BaseRawTree):
    def __init__(self, cdp_response: dict):
        self.cdp_response = cdp_response

    def to_str(self) -> str:
        return dumps(self.cdp_response)
