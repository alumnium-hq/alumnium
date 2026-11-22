from typing import Literal

from .clients.http_client import HttpClient
from .drivers.base_driver import BaseDriver

HintKind = Literal["get", "check", "find", "area"]
LessonKind = Literal["do", "get", "check", "find", "area"]
Platform = Literal["web", "ios", "android"]
Layer = Literal["shared", "product", "web", "ios", "android"]


class Knowledge:
    """
    Teaches Alumnium how to handle instructions, e.g. `al.knowledge.do(goal, actions)`.
    Lessons go to the product layer of the knowledge scope of the app the driver is
    on; `on()` and `shared()` pick another layer and `app()` another app. They apply
    to the session, and to later sessions when `ALUMNIUM_KNOWLEDGE` is enabled.
    """

    def __init__(
        self,
        client: HttpClient,
        driver: BaseDriver,
        layer: Layer = "product",
        app: str | None = None,
    ):
        self.client = client
        self.driver = driver
        self.layer: Layer = layer
        self._app = app

    def do(self, goal: str, actions: list[str]) -> None:
        """
        Teaches the actions to perform to achieve the goal with `do`.

        Args:
            goal: Goal in the same format as in `do`.
            actions: Actions to achieve the goal.
        """
        self.client.add_example(goal, actions, app=self._app_id(), layer=self.layer)

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

    def on(self, platform: Platform) -> "Knowledge":
        """
        Teaches lessons for one platform of the product.

        Args:
            platform: Platform the lessons apply to: "web", "ios" or "android".
        """
        return Knowledge(self.client, self.driver, platform, self._app)

    def shared(self) -> "Knowledge":
        """
        Teaches lessons shared by all products.
        """
        return Knowledge(self.client, self.driver, "shared", self._app)

    def app(self, app: str) -> "Knowledge":
        """
        Teaches lessons for the app rather than the one the driver is on, e.g. before
        navigating to it. The knowledge manifest maps it to its product like any other app.

        Args:
            app: App ID, host or URL as drivers report it, e.g. "example.com" or "com.example.app".
        """
        return Knowledge(self.client, self.driver, self.layer, app)

    def forget(self, kind: LessonKind, instruction: str) -> bool:
        """
        Forgets the lesson for the instruction in this layer, learned in this or an earlier session.

        Args:
            kind: Kind of lesson: "do", "get", "check", "find" or "area".
            instruction: Instruction the lesson was learned for.

        Returns:
            Whether a lesson was forgotten.
        """
        return self.client.forget_lesson(kind, instruction, app=self._app_id(), layer=self.layer)

    def clear(self) -> None:
        """
        Forgets every lesson in this layer of the knowledge scope.
        """
        self.client.clear_layer(app=self._app_id(), layer=self.layer)

    def _add_hint(self, kind: HintKind, instruction: str, hint: str) -> None:
        self.client.add_hint(kind, instruction, hint, app=self._app_id(), layer=self.layer)

    def _app_id(self) -> str:
        return self._app or self.driver.app
