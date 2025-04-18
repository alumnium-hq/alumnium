import logging
from os import getenv
from rich.logging import RichHandler

RichHandler(
    show_time=True,
    show_level=True,
    show_path=False,
    rich_tracebacks=False,
    markup=True
)

from langchain_anthropic import ChatAnthropic
from langchain_aws import ChatBedrockConverse
from langchain_deepseek import ChatDeepSeek
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from playwright.sync_api import Page
from retry import retry
from selenium.webdriver.remote.webdriver import WebDriver

from .agents import *
from .agents.retriever_agent import Data
from .drivers import PlaywrightDriver, SeleniumDriver
from .models import Model

logger = logging.getLogger(__name__)


class Alumni:
    def __init__(self, driver: Page | WebDriver, model: Model = None):
        self.model = model or Model.load()
        if isinstance(driver, WebDriver):
            self.driver = SeleniumDriver(driver)
        elif isinstance(driver, Page):
            self.driver = PlaywrightDriver(driver)
        else:
            raise NotImplementedError(f"Driver {driver} not implemented")

        logger.info(f"Using model: {self.model}")
        if self.model == Model.AZURE_OPENAI:
            llm = AzureChatOpenAI(
                model=self.model.value,
                api_version=getenv("AZURE_OPENAI_API_VERSION", ""),
                temperature=0,
                seed=1,
            )
        elif self.model == Model.ANTHROPIC:
            llm = ChatAnthropic(model=self.model.value, temperature=0)
        elif self.model == Model.AWS_ANTHROPIC or self.model == Model.AWS_META:
            llm = ChatBedrockConverse(
                model_id=self.model.value,
                temperature=0,
                aws_access_key_id=getenv("AWS_ACCESS_KEY", ""),
                aws_secret_access_key=getenv("AWS_SECRET_KEY", ""),
                region_name=getenv("AWS_REGION_NAME", "us-east-1"),
            )
        elif self.model == Model.DEEPSEEK:
            llm = ChatDeepSeek(model=self.model.value, temperature=0)
        elif self.model == Model.GOOGLE:
            llm = ChatGoogleGenerativeAI(model=self.model.value, temperature=0)
        elif self.model == Model.OPENAI:
            llm = ChatOpenAI(model=self.model.value, temperature=0, seed=1)
        else:
            raise NotImplementedError(f"Model {self.model} not implemented")

        self.actor_agent = ActorAgent(self.driver, llm)
        self.planner_agent = PlannerAgent(self.driver, llm)
        self.retrieval_agent = RetrieverAgent(self.driver, llm)

    def quit(self):
        logger.info("Shutting down the driver.")
        self.driver.quit()
        logger.info("Driver has been shut down.")

    @retry(tries=2, delay=0.1)
    def do(self, goal: str):
        """
        Executes a series of steps to achieve the given goal.

        Args:
            goal: The goal to be achieved.
        """
        logger.info("Do function defined with goal: '%s'", goal)
        steps = self.planner_agent.invoke(goal)
        logger.info("Steps planned for goal '%s': %s", goal, steps)
        for step in steps:
            self.actor_agent.invoke(goal, step)
        logger.info("Do function completed for goal: '%s'", goal)
    def check(self, statement: str, vision: bool = False) -> str:
        """
        Checks a given statement using the verifier.

        Args:
            statement: The statement to be checked.
            vision: A flag indicating whether to use a vision-based verification via a screenshot. Defaults to False.

        Returns:
            The summary of verification result.

        Raises:
            AssertionError: If the verification fails.
        """
        logger.info("Check function defined with statement: '%s' and vision: %s", statement, vision)
        result = self.retrieval_agent.invoke(f"Is the following true or false - {statement}", vision)
        assert result.value, result.explanation
        logger.info("Check function completed for statement: '%s'. Explanation: %s", statement, result.explanation)
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
        logger.info("Get function defined with data: '%s' and vision: %s", data, vision)
        return self.retrieval_agent.invoke(data, vision).value
        logger.info("Get function completed. Extracted data: %s", result)
    def learn(self, goal: str, actions: list[str]):
        """
        Adds a new learning example on what steps should be take to achieve the goal.

        Args:
            goal: The goal to be achieved. Use same format as in `do`.
            actions: A list of actions to achieve the goal.
        """
        logger.info("Learn function defined with goal: '%s' and actions: %s", goal, actions)
        self.planner_agent.add_example(goal, actions)
        logger.info("Learn function completed for goal: '%s'", goal)
