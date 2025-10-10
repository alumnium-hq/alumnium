from retry import retry

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
        driver: BaseDriver,
        tools: dict[str, BaseTool],
        client: HttpClient | NativeClient,
    ):
        self.id = id
        self.description = description
        self.driver = driver
        self.tools = tools
        self.client = client
        # Note: Server now handles area scoping internally

    @retry(tries=2, delay=0.1)
    def do(self, goal: str):
        """
        Executes a series of steps to achieve the given goal within the area.

        Args:
            goal: The goal to be achieved.
        """
        # Get raw tree
        raw_tree = self.driver.accessibility_tree
        raw_tree_str = raw_tree.to_raw()

        # Let server handle processing and scoping
        steps = self.client.plan_actions(goal, raw_tree_str, area_id=self.id)
        for step in steps:
            # Refresh tree for each step
            raw_tree = self.driver.accessibility_tree
            raw_tree_str = raw_tree.to_raw()

            actor_response = self.client.execute_action(goal, step, raw_tree_str, area_id=self.id)

            # Execute tool calls (contain raw IDs from server/client)
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
        # Get raw tree
        raw_tree = self.driver.accessibility_tree
        raw_tree_str = raw_tree.to_raw()

        # Let server handle processing and scoping
        explanation, value = self.client.retrieve(
            f"Is the following true or false - {statement}",
            raw_tree_str,
            title=self.driver.title,
            url=self.driver.url,
            screenshot=self.driver.screenshot if vision else None,
            area_id=self.id,
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
        # Get raw tree
        raw_tree = self.driver.accessibility_tree
        raw_tree_str = raw_tree.to_raw()

        # Let server handle processing and scoping
        _, value = self.client.retrieve(
            data,
            raw_tree_str,
            title=self.driver.title,
            url=self.driver.url,
            screenshot=self.driver.screenshot if vision else None,
            area_id=self.id,
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
        # Get raw tree
        raw_tree = self.driver.accessibility_tree
        raw_tree_str = raw_tree.to_raw()

        # Let server handle processing and scoping
        response = self.client.find_element(description, raw_tree_str, area_id=self.id)
        # Response contains raw platform ID from server/client
        return self.driver.find_element(response["id"])
