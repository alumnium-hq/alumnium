from typing import TypedDict


class ChromiumLocatorInfo(TypedDict):
    selector: str
    nth: int


class ChromiumSyntheticNode(TypedDict, total=False):
    nodeId: str
    role: dict[str, str]
    name: dict[str, str]
    _playwright_node: bool
    _locator_info: ChromiumLocatorInfo
    _frame_chain: list[int]
    _frame: object
