from dataclasses import dataclass, field
from pathlib import Path
from typing import Literal

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


@dataclass
class SessionTokens:
    """Session-level token usage, mirroring the server's `LlmUsageStats` shape.

    `cache` is a sibling of `total` (the cache-attributable subset). The MCP server exposes this as
    "cached"; the library standardises on the server's "cache" name.
    """

    total: TokenUsage = field(default_factory=TokenUsage)
    cache: TokenUsage = field(default_factory=TokenUsage)

    @staticmethod
    def from_dict(data: dict[str, dict[str, int]] | None) -> "SessionTokens":
        data = data or {}
        return SessionTokens(
            total=TokenUsage.from_dict(data.get("total")),
            cache=TokenUsage.from_dict(data.get("cache")),
        )


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
    tokens: SessionTokens = field(default_factory=SessionTokens)
    steps: list[StepMetrics] = field(default_factory=list)

    @property
    def last(self) -> StepMetrics | None:
        """The most recently recorded step, or None if no calls have been made."""
        return self.steps[-1] if self.steps else None
