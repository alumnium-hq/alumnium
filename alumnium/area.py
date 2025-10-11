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
        scoped_tree: str,
        driver: BaseDriver,
        tools: dict[str, BaseTool],
        client: HttpClient | NativeClient,
    ):
        self.id = id
        self.description = description
        self.scoped_tree = scoped_tree
        self.driver = driver
        self.tools = tools
        self.client = client

    def _convert_raw_ids_to_platform_ids(self, tool_calls: list[dict], raw_xml: str) -> list[dict]:
        """
        Convert raw_id values in tool calls to platform-specific IDs.

        Args:
            tool_calls: List of tool call dicts with raw_id values
            raw_xml: Raw accessibility tree XML

        Returns:
            List of tool calls with platform-specific IDs
        """
        from .accessibility.base_raw_tree import BaseRawTree

        converted_calls = []
        for call in tool_calls:
            converted_call = call.copy()
            args = call.get("args", {}).copy()

            # Convert ID fields from raw_id to platform-specific ID
            for id_field in ["id", "from_id", "to_id"]:
                if id_field in args:
                    raw_id = args[id_field]
                    platform_id = BaseRawTree.get_platform_id(raw_xml, raw_id, self.driver.platform)
                    args[id_field] = platform_id

            converted_call["args"] = args
            converted_calls.append(converted_call)

        return converted_calls

    @retry(tries=2, delay=0.1)
    def do(self, goal: str):
        """
        Executes a series of steps to achieve the given goal within the area.

        Args:
            goal: The goal to be achieved.
        """
        steps = self.client.plan_actions(goal, self.scoped_tree)
        for step in steps:
            # Re-scope tree after each step in case the page changed
            raw_xml = self.driver.accessibility_tree.to_str()
            response = self.client.find_area(self.description, raw_xml)
            scoped_xml = self.client.scope_to_area(raw_xml, response["id"])

            actor_response = self.client.execute_action(goal, step, scoped_xml)

            # Convert raw_ids to platform-specific IDs
            converted_calls = self._convert_raw_ids_to_platform_ids(actor_response, raw_xml)

            # Execute tool calls
            for tool_call in converted_calls:
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
            self.scoped_tree,
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
            self.scoped_tree,
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
        from .accessibility.base_raw_tree import BaseRawTree

        # Use full raw tree for ID conversion (scoped tree may not have backend IDs)
        raw_xml = self.driver.accessibility_tree.to_str()
        response = self.client.find_element(description, self.scoped_tree)

        # Convert raw_id to platform-specific ID
        raw_id = response["id"]
        platform_id = BaseRawTree.get_platform_id(raw_xml, raw_id, self.driver.platform)

        return self.driver.find_element(platform_id)
