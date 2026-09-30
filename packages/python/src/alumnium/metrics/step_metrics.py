from dataclasses import dataclass, field
from typing import Literal

from .artifact import Artifact
from .tokens import Tokens


@dataclass
class StepMetrics:
    """Metrics for a single public `do()`/`check()`/`get()` call."""

    kind: Literal["do", "check", "get"]
    label: str
    outcome: Literal["passed", "failed"]
    started_at: float
    finished_at: float
    duration: float
    tokens: Tokens = field(default_factory=Tokens)
    artifacts: list[Artifact] = field(default_factory=list)
