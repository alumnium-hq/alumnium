from dataclasses import dataclass
from pathlib import Path
from typing import Literal


@dataclass
class Artifact:
    """A file captured during a step, typed so consumers can route by kind and mime."""

    path: Path
    kind: Literal["screenshot", "trace"]
    mime: str
