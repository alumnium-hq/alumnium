from asyncio import AbstractEventLoop
from os import getenv

from appium.webdriver.webdriver import WebDriver as Appium
from playwright.async_api import Page as PageAsync
from playwright.sync_api import Page
from retry import retry
from selenium.webdriver.remote.webdriver import WebDriver

from . import CHANGE_ANALYSIS, DELAY, EXCLUDE_ATTRIBUTES, PLANNER, RETRIES
from .area import Area
from .cache import Cache
from .clients.http_client import HttpClient
from .clients.typecasting import Data
from .drivers import Element
from .drivers.appium_driver import AppiumDriver
from .drivers.playwright_async_driver import PlaywrightAsyncDriver
from .drivers.playwright_driver import PlaywrightDriver
from .drivers.selenium_driver import SeleniumDriver
from .logutils import get_logger
from .models import Model
from .result import DoResult, DoStep
from .tools import BaseTool

logger = get_logger(__name__)


class Alumni:
    def __init__(
        self,
        driver: Page | WebDriver | tuple[PageAsync, AbstractEventLoop],
        model: Model | None = None,
        extra_tools: list[type[BaseTool]] | None = None,
        url: str | None = None,
        planner: bool | None = None,
        change_analysis: bool | None = None,
        exclude_attributes: set[str] | None = None,
    ):
        planner = planner if planner is not None else PLANNER
        self.change_analysis = change_analysis if change_analysis is not None else CHANGE_ANALYSIS
        exclude_attributes = exclude_attributes if exclude_attributes is not None else EXCLUDE_ATTRIBUTES

        if isinstance(driver, Appium):
            self.driver = AppiumDriver(driver)
        elif isinstance(driver, Page):
            self.driver = PlaywrightDriver(driver)
        elif (
            isinstance(driver, tuple) and isinstance(driver[0], PageAsync) and isinstance(driver[1], AbstractEventLoop)
        ):
            # Asynchronous Playwright driver requires a shared event loop
            self.driver = PlaywrightAsyncDriver(driver[0], driver[1])
        elif isinstance(driver, WebDriver):
            self.driver = SeleniumDriver(driver)
        else:
            raise NotImplementedError(f"Driver {driver} not implemented")

        self.tools = {}
        for tool in self.driver.supported_tools | set(extra_tools or []):
            self.tools[tool.__name__] = tool

        server_url = url or getenv("ALUMNIUM_SERVER_URL")
        if server_url:
            logger.info(f"Using HTTP client with server: {server_url}")
        else:
            logger.info("Using HTTP client with auto-managed local server")

        self.client = HttpClient(
            server_url,
            model,
            self.driver.platform,
            self.tools,
            planner,
            exclude_attributes,
        )

        self.model = Model.from_string(self.client.get_session_configuration()["model"])
        logger.info(f"Using model: {self.model.provider.value}/{self.model.name}")

        self.cache = Cache(self.client)

    def quit(self):
        self.client.quit()
        self.driver.quit()

    def get_model(self) -> Model:
        self.model = Model.from_string(self.client.get_session_configuration()["model"])
        return self.model

    @retry(tries=RETRIES, delay=DELAY, logger=logger)  # pyright: ignore[reportArgumentType]
    def do(self, goal: str) -> DoResult:
        """
        Executes a series of steps to achieve the given goal.

        Args:
            goal: The goal to be achieved.

        Returns:
            DoResult containing the explanation and executed steps with their actions.
        """
        app = self.driver.app
        initial_accessibility_tree = self.driver.accessibility_tree
        before_tree = initial_accessibility_tree.to_str() if self.change_analysis else None
        before_url = self.driver.url if self.change_analysis else None
        explanation, steps = self.client.plan_actions(goal, initial_accessibility_tree.to_str(), app=app)

        executed_steps = []
        for idx, step in enumerate(steps):
            # If the step is the first step, use the initial accessibility tree.
            accessibility_tree = initial_accessibility_tree if idx == 0 else self.driver.accessibility_tree
            actor_explanation, actions = self.client.execute_action(goal, step, accessibility_tree.to_str(), app=app)

            # When planner is off, explanation is just the goal — replace with actor's reasoning.
            if explanation == goal:
                explanation = actor_explanation

            called_tools = []
            for tool_call in actions:
                called_tool = BaseTool.execute_tool_call(tool_call, self.tools, self.driver)
                called_tools.append(called_tool)

            executed_steps.append(DoStep(name=step, tools=called_tools))

        changes = ""
        if self.change_analysis and executed_steps:
            try:
                assert before_tree is not None
                assert before_url is not None
                changes = self.client.analyze_changes(
                    before_accessibility_tree=before_tree,
                    before_url=before_url,
                    after_accessibility_tree=self.driver.accessibility_tree.to_str(),
                    after_url=self.driver.url,
                )
            except Exception as e:
                logger.error(f"Error analyzing changes: {e}")

        return DoResult(explanation=explanation, steps=executed_steps, changes=changes)

    @retry(tries=RETRIES, delay=DELAY, logger=logger)  # pyright: ignore[reportArgumentType]
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
        explanation, value = self.client.retrieve(
            f"Is the following true or false - {statement}",
            self.driver.accessibility_tree.to_str(),
            title=self.driver.title,
            url=self.driver.url,
            screenshot=self.driver.screenshot if vision else None,
            app=self.driver.app,
        )
        assert value, explanation
        return explanation

    @retry(tries=RETRIES, delay=DELAY, logger=logger)  # pyright: ignore[reportArgumentType]
    def get(self, data: str, vision: bool = False) -> Data:
        """
        Extracts requested data from the page.

        Args:
            data: The data to extract.
            vision: A flag indicating whether to use a vision-based extraction via a screenshot. Defaults to False.

        Returns:
            The extracted data. If data cannot be extracted, returns the explanation string.
        """
        explanation, value = self.client.retrieve(
            data,
            self.driver.accessibility_tree.to_str(),
            title=self.driver.title,
            url=self.driver.url,
            screenshot=self.driver.screenshot if vision else None,
            app=self.driver.app,
        )
        return explanation if value is None else value

    @retry(tries=RETRIES, delay=DELAY, logger=logger)  # pyright: ignore[reportArgumentType]
    def find(self, description: str) -> Element:
        """
        Finds an element in the accessibility tree and returns the native driver element.

        Args:
            description: Natural language description of the element to find.

        Returns:
            Native driver element (Selenium WebElement, Playwright Locator, or Appium WebElement).
        """
        response = self.client.find_element(description, self.driver.accessibility_tree.to_str(), app=self.driver.app)
        return self.driver.find_element(response["id"])

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
        accessibility_tree = self.driver.accessibility_tree
        response = self.client.find_area(description, accessibility_tree.to_str(), app=self.driver.app)
        return Area(
            id=response["id"],
            description=response["explanation"],
            driver=self.driver,
            accessibility_tree=accessibility_tree.scope_to_area(response["id"]),
            tools=self.tools,
            client=self.client,
        )

    def learn(self, goal: str, actions: list[str]):
        """
        Adds a new learning example on what steps should be take to achieve the goal.

        Args:
            goal: The goal to be achieved. Use same format as in `do`.
            actions: A list of actions to achieve the goal.
        """
        self.client.add_example(goal, actions)

    def clear_learn_examples(self):
        """
        Clears the learn examples.
        """
        self.client.clear_examples()

    @property
    def stats(self) -> dict[str, dict[str, int]]:
        """
        Returns the stats of the session.
        """
        return self.client.stats
