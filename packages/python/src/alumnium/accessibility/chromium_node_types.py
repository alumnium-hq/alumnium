from typing import TypedDict


class ChromiumSyntheticNode(TypedDict, total=False):
    nodeId: str
    role: dict[str, str]
    name: dict[str, str]
    _frame_chain: list[int]
    _frame: object
