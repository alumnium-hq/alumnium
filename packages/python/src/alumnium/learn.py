from typing import Literal

from .clients.http_client import HttpClient
from .drivers.base_driver import BaseDriver

HintKind = Literal["get", "check", "find", "area"]


class Learn:
    """
    Teaches Alumnium how to handle instructions. Lessons are persisted for
    the current app and apply to later sessions.

    Calling it directly is the same as calling `learn.do()`.
    """

    def __init__(self, client: HttpClient, driver: BaseDriver):
        self.client = client
        self.driver = driver

    def __call__(self, goal: str, actions: list[str]) -> None:
        self.do(goal, actions)

    def do(self, goal: str, actions: list[str]) -> None:
        """
        Teaches the actions to perform to achieve the goal with `do`.

        Args:
            goal: Goal in the same format as in `do`.
            actions: Actions to achieve the goal.
        """
        self.client.add_example(goal, actions, app=self.driver.app)

    def get(self, data: str, hint: str) -> None:
        """
        Teaches how to retrieve the data with `get`.

        Args:
            data: Data in the same format as in `get`.
            hint: How to retrieve it, e.g. which element holds it.
        """
        self._add_hint("get", data, hint)

    def check(self, statement: str, hint: str) -> None:
        """
        Teaches how to verify the statement with `check`.

        Args:
            statement: Statement in the same format as in `check`.
            hint: How to verify it, e.g. what makes it true.
        """
        self._add_hint("check", statement, hint)

    def find(self, description: str, hint: str) -> None:
        """
        Teaches how to locate the element with `find`.

        Args:
            description: Description in the same format as in `find`.
            hint: How to locate it, e.g. its role and name.
        """
        self._add_hint("find", description, hint)

    def area(self, description: str, hint: str) -> None:
        """
        Teaches how to identify the area with `area`.

        Args:
            description: Description in the same format as in `area`.
            hint: How to identify it, e.g. its container and heading.
        """
        self._add_hint("area", description, hint)

    def _add_hint(self, kind: HintKind, instruction: str, hint: str) -> None:
        self.client.add_hint(kind, instruction, hint, app=self.driver.app)
