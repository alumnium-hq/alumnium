import time
from dataclasses import dataclass, field
from functools import wraps
from pathlib import Path
from types import FunctionType
from typing import TYPE_CHECKING, Literal, cast

if TYPE_CHECKING:
    from .alumni import Alumni

# Field names mirror the server's `LlmUsage` schema (packages/typescript/src/llm/llmSchema.ts)
# verbatim so the server -> client -> reporter layers cannot drift.
_TOKEN_FIELDS = (
    "input_tokens",
    "output_tokens",
    "total_tokens",
    "cache_creation",
    "cache_read",
    "reasoning",
)


@dataclass
class TokenUsage:
    """Token usage for a single call or aggregated across a session."""

    input_tokens: int = 0
    output_tokens: int = 0
    total_tokens: int = 0
    cache_creation: int = 0
    cache_read: int = 0
    reasoning: int = 0

    @staticmethod
    def from_dict(data: dict[str, int] | None) -> "TokenUsage":
        """Build a TokenUsage from a server `LlmUsage` payload, ignoring unknown keys."""
        data = data or {}
        return TokenUsage(**{name: int(data.get(name, 0)) for name in _TOKEN_FIELDS})

    def __add__(self, other: "TokenUsage") -> "TokenUsage":
        return TokenUsage(**{name: getattr(self, name) + getattr(other, name) for name in _TOKEN_FIELDS})

    def __sub__(self, other: "TokenUsage") -> "TokenUsage":
        """Field-wise delta, mirroring the server's `subtractLlmUsage` (no clamping)."""
        return TokenUsage(**{name: getattr(self, name) - getattr(other, name) for name in _TOKEN_FIELDS})


@dataclass
class Artifact:
    """A file captured during a step (screenshot, trace, ...), typed so consumers route by kind/mime."""

    path: Path
    kind: Literal["screenshot", "trace"]
    mime: str


@dataclass
class StepMetrics:
    """Metrics for a single public `do()`/`check()`/`get()` call.

    Correlation is positional: entries appear in `SessionMetrics.steps` in call order.
    """

    kind: Literal["do", "check", "get"]
    label: str
    outcome: Literal["passed", "failed"]
    started_at: float
    finished_at: float
    duration: float
    tokens: TokenUsage = field(default_factory=TokenUsage)
    artifacts: list[Artifact] = field(default_factory=list)


@dataclass
class SessionMetrics:
    """Execution metrics for an Alumni session, read via `al.metrics`."""

    started_at: float
    finished_at: float
    duration: float
    tokens: TokenUsage = field(default_factory=TokenUsage)
    steps: list[StepMetrics] = field(default_factory=list)

    @property
    def last(self) -> StepMetrics | None:
        """The most recently recorded step, or None if no calls have been made."""
        return self.steps[-1] if self.steps else None


def record_metrics(method: FunctionType):
    """
    Records one `StepMetrics` entry per public `do()`/`check()`/`get()` call.

    Wraps the retried method, so the recorded duration and token usage cover every attempt and the
    outcome is decided by whether the call ultimately raised. The step kind is the method name and
    the label is its first argument (the goal, statement, or data description).
    """

    kind = cast(Literal["do", "check", "get"], method.__name__)

    @wraps(method)
    def wrapper(self: "Alumni", label: str, *args, **kwargs):
        started_at = time.time()
        monotonic_start = time.monotonic()
        usage_before = self.client.usage_total
        outcome: Literal["passed", "failed"] = "passed"
        try:
            return method(self, label, *args, **kwargs)
        except Exception:
            outcome = "failed"
            raise
        finally:
            duration = time.monotonic() - monotonic_start
            artifact = self._capture_screenshot(label)
            self._steps.append(
                StepMetrics(
                    kind=kind,
                    label=label,
                    outcome=outcome,
                    started_at=started_at,
                    finished_at=time.time(),
                    duration=duration,
                    tokens=self.client.usage_total - usage_before,
                    artifacts=[artifact] if artifact is not None else [],
                )
            )

    return wrapper
