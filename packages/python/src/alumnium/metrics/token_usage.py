from dataclasses import dataclass

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
        data = data or {}
        return TokenUsage(**{name: int(data.get(name, 0)) for name in _TOKEN_FIELDS})

    def __add__(self, other: "TokenUsage") -> "TokenUsage":
        return TokenUsage(**{name: getattr(self, name) + getattr(other, name) for name in _TOKEN_FIELDS})

    def __sub__(self, other: "TokenUsage") -> "TokenUsage":
        return TokenUsage(**{name: getattr(self, name) - getattr(other, name) for name in _TOKEN_FIELDS})
