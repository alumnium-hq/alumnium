from dataclasses import dataclass, field

from .step_metrics import StepMetrics
from .tokens import Tokens


@dataclass
class SessionMetrics:
    """Execution metrics for an Alumni session, read via `al.metrics`."""

    started_at: float
    finished_at: float
    duration: float
    tokens: Tokens = field(default_factory=Tokens)
    steps: list[StepMetrics] = field(default_factory=list)

    @property
    def last(self) -> StepMetrics | None:
        return self.steps[-1] if self.steps else None
