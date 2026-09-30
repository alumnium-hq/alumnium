from dataclasses import dataclass, field

from .token_usage import TokenUsage


@dataclass
class Tokens:
    """
    Token usage for a single call or a whole session.

    `total` is everything the agents consumed; `cached` is the part of it replayed from Alumnium's
    response cache, which the model provider did not bill.
    """

    total: TokenUsage = field(default_factory=TokenUsage)
    cached: TokenUsage = field(default_factory=TokenUsage)

    @property
    def paid(self) -> TokenUsage:
        """Tokens actually sent to the model provider (`total - cached`)."""
        return self.total - self.cached

    @staticmethod
    def from_dict(data: dict[str, dict[str, int]] | None) -> "Tokens":
        data = data or {}
        return Tokens(
            total=TokenUsage.from_dict(data.get("total")),
            cached=TokenUsage.from_dict(data.get("cached")),
        )

    def __add__(self, other: "Tokens") -> "Tokens":
        return Tokens(total=self.total + other.total, cached=self.cached + other.cached)

    def __sub__(self, other: "Tokens") -> "Tokens":
        return Tokens(total=self.total - other.total, cached=self.cached - other.cached)
