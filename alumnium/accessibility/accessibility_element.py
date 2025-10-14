from dataclasses import dataclass


@dataclass
class AccessibilityElement:
    id: int | None = None
    backend_node_id: int | None = None
    name: str | None = None
    label: str | None = None
    type: str | None = None
    value: str | None = None
    androidresourceid: str | None = None
    androidclass: str | None = None
    androidtext: str | None = None
    androidcontentdesc: str | None = None
    androidbounds: str | None = None
