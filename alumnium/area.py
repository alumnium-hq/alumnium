from retry import retry

from alumnium.client import Client
from alumnium.drivers.base_driver import BaseDriver
from alumnium.tools import BaseTool

from .agents.retriever_agent import Data


class Area:
    def __init__(
        self,
        id: int,
        description: str,
        driver: BaseDriver,
        tools: dict[str, BaseTool],
        client: Client,
    ):
        self.id = id
        self.description = description
        self.driver = driver
        self.accessibility_tree = driver.accessibility_tree.get_area(id)
        self.tools = tools
        self.client = client

    @retry(tries=2, delay=0.1)
    def do(self, goal: str):
        """
        Executes a series of steps to achieve the given goal within the area.

        Args:
            goal: The goal to be achieved.
        """
        steps = self.client.planner_agent.invoke(goal, self.accessibility_tree.to_xml())
        for step in steps:
            actor_response = self.client.actor_agent.invoke(goal, step, self.accessibility_tree.to_xml())

            # Execute tool calls
            for tool_call in actor_response:
                BaseTool.execute_tool_call(tool_call, self.tools, self.accessibility_tree, self.driver)

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
        result = self.client.retriever_agent.invoke(
            f"Is the following true or false - {statement}",
            self.accessibility_tree.to_xml(),
            title=self.driver.title,
            url=self.driver.url,
            screenshot=self.driver.screenshot if vision else None,
        )
        assert result.value, result.explanation
        return result.explanation

    def get(self, data: str, vision: bool = False) -> Data:
        """
        Extracts requested data from the area.

        Args:
            data: The data to extract.
            vision: A flag indicating whether to use a vision-based extraction via a screenshot. Defaults to False.

        Returns:
            Data: The extracted data loosely typed to int, float, str, or list of them.
        """
        return self.client.retriever_agent.invoke(
            data,
            self.accessibility_tree.to_xml(),
            title=self.driver.title,
            url=self.driver.url,
            screenshot=self.driver.screenshot if vision else None,
        ).value
