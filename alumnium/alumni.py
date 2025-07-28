from os import getenv

from appium.webdriver.webdriver import WebDriver as Appium
from langchain_anthropic import ChatAnthropic
from langchain_aws import ChatBedrockConverse
from langchain_deepseek import ChatDeepSeek
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_mistralai import ChatMistralAI
from langchain_ollama import ChatOllama
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from playwright.sync_api import Page
from retry import retry
from selenium.webdriver.remote.webdriver import WebDriver

from alumnium.tools import ALL_APPIUM_TOOLS, ALL_TOOLS, BaseTool

from .agents import *
from .agents.retriever_agent import Data
from .area import Area
from .cache import Cache
from .drivers import AppiumDriver, PlaywrightDriver, SeleniumDriver
from .logutils import get_logger
from .models import Model, Provider

logger = get_logger(__name__)


class Alumni:
    def __init__(self, driver: Page | WebDriver, model: Model = None):
        self.model = model or Model.current

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
        if self.model.provider == Provider.AZURE_OPENAI:
            llm = AzureChatOpenAI(
                model=self.model.name,
                api_version=getenv("AZURE_OPENAI_API_VERSION", ""),
                temperature=0,
                seed=1,
            )
        elif self.model.provider == Provider.ANTHROPIC:
            llm = ChatAnthropic(model=self.model.name, temperature=0)
        elif self.model.provider == Provider.AWS_ANTHROPIC or self.model.provider == Provider.AWS_META:
            llm = ChatBedrockConverse(
                model_id=self.model.name,
                temperature=0,
                aws_access_key_id=getenv("AWS_ACCESS_KEY", ""),
                aws_secret_access_key=getenv("AWS_SECRET_KEY", ""),
                region_name=getenv("AWS_REGION_NAME", "us-east-1"),
            )
        elif self.model.provider == Provider.DEEPSEEK:
            llm = ChatDeepSeek(model=self.model.name, temperature=0)
        elif self.model.provider == Provider.GOOGLE:
            llm = ChatGoogleGenerativeAI(model=self.model.name, temperature=0)
        elif self.model.provider == Provider.MISTRALAI:
            llm = ChatMistralAI(model=self.model.name, temperature=0)
        elif self.model.provider == Provider.OLLAMA:
            llm = ChatOllama(model=self.model.name, temperature=0)
        elif self.model.provider == Provider.OPENAI:
            llm = ChatOpenAI(model=self.model.name, temperature=0, seed=1)
        else:
            raise NotImplementedError(f"Model {self.model.provider} not implemented")

        self.cache = Cache()
        llm.cache = self.cache

        self.actor_agent = ActorAgent(llm, self.tools)
        self.planner_agent = PlannerAgent(llm)
        self.retriever_agent = RetrieverAgent(llm)
        self.area_agent = AreaAgent(llm)

    def quit(self):
        self.driver.quit()

    @retry(tries=2, delay=0.1)
    def do(self, goal: str):
        """
        Executes a series of steps to achieve the given goal.

        Args:
            goal: The goal to be achieved.
        """
        initial_accessibility_tree = self.driver.accessibility_tree
        steps = self.planner_agent.invoke(goal, initial_accessibility_tree.to_xml())
        for idx, step in enumerate(steps):
            # If the step is the first step, use the initial accessibility tree.
            accessibility_tree = initial_accessibility_tree if idx == 0 else self.driver.accessibility_tree
            actor_response = self.actor_agent.invoke(goal, step, accessibility_tree.to_xml())

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
        result = self.retriever_agent.invoke(
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
        return self.retriever_agent.invoke(
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
        response = self.area_agent.invoke(description, self.driver.accessibility_tree.to_xml())
        return Area(
            id=response["id"],
            description=response["explanation"],
            driver=self.driver,
            tools=self.tools,
            actor_agent=self.actor_agent,
            planner_agent=self.planner_agent,
            retriever_agent=self.retriever_agent,
        )

    def learn(self, goal: str, actions: list[str]):
        """
        Adds a new learning example on what steps should be take to achieve the goal.

        Args:
            goal: The goal to be achieved. Use same format as in `do`.
            actions: A list of actions to achieve the goal.
        """
        self.planner_agent.add_example(goal, actions)

    def stats(self) -> dict[str, int]:
        """
        Provides statistics about the usage of tokens.

        Returns:
            A dictionary containing the number of input tokens, output tokens, and total tokens used by all agents.
        """
        return {
            "input_tokens": (
                self.planner_agent.usage["input_tokens"]
                + self.actor_agent.usage["input_tokens"]
                + self.retriever_agent.usage["input_tokens"]
            ),
            "output_tokens": (
                self.planner_agent.usage["output_tokens"]
                + self.actor_agent.usage["output_tokens"]
                + self.retriever_agent.usage["output_tokens"]
            ),
            "total_tokens": (
                self.planner_agent.usage["total_tokens"]
                + self.actor_agent.usage["total_tokens"]
                + self.retriever_agent.usage["total_tokens"]
            ),
        }
