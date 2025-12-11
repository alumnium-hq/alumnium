from dataclasses import dataclass

from .clients.typecasting import Data


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


@dataclass
class GetResult:
    """Result of executing Alumni.get() or Area.get()."""

    explanation: str
    data: Data
