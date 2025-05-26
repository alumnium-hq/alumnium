from dataclasses import dataclass
from typing import Optional


@dataclass
class AccessibilityElement:
    id: int
    name: Optional[str] = None
    label: Optional[str] = None
    type: Optional[str] = None
    value: Optional[str] = None
