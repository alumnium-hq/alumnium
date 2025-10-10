from abc import ABC, abstractmethod


class BaseRawTree(ABC):
    @abstractmethod
    def to_str(self) -> str:
        pass
