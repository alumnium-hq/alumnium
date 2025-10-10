from abc import ABC, abstractmethod


class BaseRawTree(ABC):
    """Base class for raw accessibility trees (minimal wrappers for client-side)."""

    @abstractmethod
    def to_raw(self) -> str:
        """Convert the raw tree to a string for sending to the server."""
        pass

    @abstractmethod
    def platform_name(self) -> str:
        """Return the platform name (chromium, xcuitest, uiautomator2)."""
        pass
