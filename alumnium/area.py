from retry import retry

from .accessibility.base_accessibility_tree import BaseAccessibilityTree
from .clients.http_client import HttpClient
from .clients.native_client import NativeClient
from .drivers import Element
from .drivers.base_driver import BaseDriver
from .server.agents.retriever_agent import Data
from .tools import BaseTool


class Area:
    def __init__(
        self,
        id: int,
        description: str,
        accessibility_tree: BaseAccessibilityTree,
        driver: BaseDriver,
        tools: dict[str, BaseTool],
        client: HttpClient | NativeClient,
    ):
        self.id = id
        self.description = description
        self.driver = driver
        self.accessibility_tree = accessibility_tree
        self.tools = tools
        self.client = client

    @retry(tries=2, delay=0.1)
    def do(self, goal: str):
        """
        Executes a series of steps to achieve the given goal within the area.

        Args:
            goal: The goal to be achieved.
        """
        steps = self.client.plan_actions(goal, self.accessibility_tree.to_str())
        for step in steps:
            actor_response = self.client.execute_action(goal, step, self.accessibility_tree.to_str())

            # Execute tool calls
            for tool_call in actor_response:
                BaseTool.execute_tool_call(tool_call, self.tools, self.driver)

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

    def get(self, data: str, vision: bool = False) -> Data:
        """
        Extracts requested data from the area.

        Args:
            data: The data to extract.
            vision: A flag indicating whether to use a vision-based extraction via a screenshot. Defaults to False.

        Returns:
            Data: The extracted data loosely typed to int, float, str, or list of them.
        """
        _, value = self.client.retrieve(
            data,
            self.accessibility_tree.to_str(),
            title=self.driver.title,
            url=self.driver.url,
            screenshot=self.driver.screenshot if vision else None,
        )
        return value

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
