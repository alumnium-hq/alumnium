from retry import retry

from . import DELAY, RETRIES
from .accessibility.base_accessibility_tree import BaseAccessibilityTree
from .clients.http_client import HttpClient
from .clients.native_client import NativeClient
from .clients.typecasting import Data
from .drivers import Element
from .drivers.base_driver import BaseDriver
from .result import DoResult, DoStep
from .server.logutils import get_logger
from .tools import BaseTool

logger = get_logger(__name__)


class Area:
    def __init__(
        self,
        id: int,
        description: str,
        driver: BaseDriver,
        accessibility_tree: BaseAccessibilityTree,
        tools: dict[str, BaseTool],
        client: HttpClient | NativeClient,
    ):
        self.id = id
        self.description = description
        self.driver = driver
        self.accessibility_tree = accessibility_tree
        self.tools = tools
        self.client = client

    @retry(tries=RETRIES, delay=DELAY, logger=logger)
    def do(self, goal: str) -> DoResult:
        """
        Executes a series of steps to achieve the given goal within the area.

        Args:
            goal: The goal to be achieved.

        Returns:
            DoResult containing the explanation and executed steps with their actions.
        """
        explanation, steps = self.client.plan_actions(goal, self.accessibility_tree.to_str())

        executed_steps = []
        for step in steps:
            actor_explanation, actions = self.client.execute_action(goal, step, self.accessibility_tree.to_str())

            # When planner is off, explanation is just the goal — replace with actor's reasoning.
            if explanation == goal:
                explanation = actor_explanation

            called_tools = []
            for tool_call in actions:
                called_tool = BaseTool.execute_tool_call(tool_call, self.tools, self.driver)
                called_tools.append(called_tool)

            executed_steps.append(DoStep(name=step, tools=called_tools))

        return DoResult(explanation=explanation, steps=executed_steps)

    @retry(tries=RETRIES, delay=DELAY, logger=logger)
    def check(self, statement: str, vision: bool = False) -> str:
        """
        Checks a given statement true or false within the area.

        Args:
            statement: The statement to be checked.
            vision: A flag indicating whether to use a vision-based verification via a screenshot. Defaults to False.

        Returns:
            The summary of verification result.

        Raises:
            AssertionError: If the verification fails.
        """
        explanation, value = self.client.retrieve(
            f"Is the following true or false - {statement}",
            self.accessibility_tree.to_str(),
            title=self.driver.title,
            url=self.driver.url,
            screenshot=self.driver.screenshot if vision else None,
        )
        assert value, explanation
        return explanation

    @retry(tries=RETRIES, delay=DELAY, logger=logger)
    def get(self, data: str, vision: bool = False) -> Data:
        """
        Extracts requested data from the area.

        Args:
            data: The data to extract.
            vision: A flag indicating whether to use a vision-based extraction via a screenshot. Defaults to False.

        Returns:
            The extracted data. If data cannot be extracted, returns the explanation string.
        """
        explanation, value = self.client.retrieve(
            data,
            self.accessibility_tree.to_str(),
            title=self.driver.title,
            url=self.driver.url,
            screenshot=self.driver.screenshot if vision else None,
        )
        return explanation if value is None else value

    @retry(tries=RETRIES, delay=DELAY, logger=logger)
    def find(self, description: str) -> Element:
        """
        Finds an element within this area and returns the native driver element.

        Args:
            description: Natural language description of the element to find.

        Returns:
            Native driver element (Selenium WebElement, Playwright Locator, or Appium WebElement).
        """
        response = self.client.find_element(description, self.accessibility_tree.to_str())
        return self.driver.find_element(response["id"])
