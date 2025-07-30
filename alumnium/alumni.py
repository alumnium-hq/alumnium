from os import getenv

from appium.webdriver.webdriver import WebDriver as Appium
from playwright.sync_api import Page
from retry import retry
from selenium.webdriver.remote.webdriver import WebDriver

from alumnium.session import SessionManager
from alumnium.tools import ALL_APPIUM_TOOLS, ALL_TOOLS, BaseTool

from .agents import *
from .agents.retriever_agent import Data
from .area import Area
from .drivers import AppiumDriver, PlaywrightDriver, SeleniumDriver
from .logutils import get_logger
from .models import Model

logger = get_logger(__name__)


class Alumni:
    def __init__(self, driver: Page | WebDriver, model: Model = None):
        self.model = model or Model.current
        self.session_manager = SessionManager()

        if isinstance(driver, Appium):
            self.driver = AppiumDriver(driver)
            self.tools = ALL_APPIUM_TOOLS
        elif isinstance(driver, Page):
            self.driver = PlaywrightDriver(driver)
            self.tools = ALL_TOOLS
        elif isinstance(driver, WebDriver):
            self.driver = SeleniumDriver(driver)
            self.tools = ALL_TOOLS
        else:
            raise NotImplementedError(f"Driver {driver} not implemented")

        logger.info(f"Using model: {self.model.provider.value}/{self.model.name}")

        # Get environment variables for different providers
        azure_openai_api_version = getenv("AZURE_OPENAI_API_VERSION")
        aws_access_key = getenv("AWS_ACCESS_KEY")
        aws_secret_key = getenv("AWS_SECRET_KEY")
        aws_region_name = getenv("AWS_REGION_NAME", "us-east-1")

        # Create session
        self.session_id = self.session_manager.create_session(
            provider=self.model.provider,
            name=self.model.name,
            tools=self.tools,
            azure_openai_api_version=azure_openai_api_version,
            aws_access_key=aws_access_key,
            aws_secret_key=aws_secret_key,
            aws_region_name=aws_region_name,
        )

    def quit(self):
        self.session_manager.delete_session(self.session_id)
        self.driver.quit()

    @retry(tries=2, delay=0.1)
    def do(self, goal: str):
        """
        Executes a series of steps to achieve the given goal.

        Args:
            goal: The goal to be achieved.
        """
        initial_accessibility_tree = self.driver.accessibility_tree
        session = self.session_manager.get_session(self.session_id)
        steps = session.planner_agent.invoke(goal, initial_accessibility_tree.to_xml())
        for idx, step in enumerate(steps):
            # If the step is the first step, use the initial accessibility tree.
            accessibility_tree = initial_accessibility_tree if idx == 0 else self.driver.accessibility_tree
            actor_response = session.actor_agent.invoke(goal, step, accessibility_tree.to_xml())

            # Execute tool calls
            for tool_call in actor_response:
                BaseTool.execute_tool_call(tool_call, self.tools, accessibility_tree, self.driver)

    def check(self, statement: str, vision: bool = False) -> str:
        """
        Checks a given statement true or false.

        Args:
            statement: The statement to be checked.
            vision: A flag indicating whether to use a vision-based verification via a screenshot. Defaults to False.

        Returns:
            The summary of verification result.

        Raises:
            AssertionError: If the verification fails.
        """
        session = self.session_manager.get_session(self.session_id)
        result = session.retriever_agent.invoke(
            f"Is the following true or false - {statement}",
            self.driver.accessibility_tree.to_xml(),
            title=self.driver.title,
            url=self.driver.url,
            screenshot=self.driver.screenshot if vision else None,
        )
        assert result.value, result.explanation
        return result.explanation

    def get(self, data: str, vision: bool = False) -> Data:
        """
        Extracts requested data from the page.

        Args:
            data: The data to extract.
            vision: A flag indicating whether to use a vision-based extraction via a screenshot. Defaults to False.

        Returns:
            Data: The extracted data loosely typed to int, float, str, or list of them.
        """
        session = self.session_manager.get_session(self.session_id)
        return session.retriever_agent.invoke(
            data,
            self.driver.accessibility_tree.to_xml(),
            title=self.driver.title,
            url=self.driver.url,
            screenshot=self.driver.screenshot if vision else None,
        ).value

    def area(self, description: str) -> Area:
        """
        Creates an area for the agents to work within.
        This is useful for narrowing down the context or focus of the agents' actions, checks and data retrievals.

        Note that if the area cannot be found, the topmost area of the accessibility tree will be used,
        which is equivalent to the whole page.

        Args:
            description: The description of the area.

        Returns:
            Area: An instance of the Area class that represents the area of the accessibility tree to use.
        """
        session = self.session_manager.get_session(self.session_id)
        response = session.area_agent.invoke(description, self.driver.accessibility_tree.to_xml())
        return Area(
            id=response["id"],
            description=response["explanation"],
            driver=self.driver,
            tools=self.tools,
            session=session,
        )

    def learn(self, goal: str, actions: list[str]):
        """
        Adds a new learning example on what steps should be take to achieve the goal.

        Args:
            goal: The goal to be achieved. Use same format as in `do`.
            actions: A list of actions to achieve the goal.
        """
        session = self.session_manager.get_session(self.session_id)
        session.planner_agent.add_example(goal, actions)

    def clear_learn_examples(self):
        """
        Clears the learn examples.
        """
        session = self.session_manager.get_session(self.session_id)
        session.planner_agent.prompt_with_examples.examples.clear()

    def stats(self) -> dict[str, int]:
        """
        Returns the stats of the session.
        """
        session = self.session_manager.get_session(self.session_id)
        return session.stats()

    def save_cache(self):
        """
        Saves the cache.
        """
        session = self.session_manager.get_session(self.session_id)
        session.cache.save()

    def clear_cache(self):
        """
        Clears the cache.
        """
        session = self.session_manager.get_session(self.session_id)
        session.cache.discard()
