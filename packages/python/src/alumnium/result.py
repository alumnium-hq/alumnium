from dataclasses import dataclass


@dataclass
class DoStep:
    """Represents a single step in a do() execution."""

    name: str
    tools: list[str]


@dataclass
class DoResult:
    """Result of executing Alumni.do()."""

    explanation: str
    steps: list[DoStep]
