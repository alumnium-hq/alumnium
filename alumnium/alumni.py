import logging
from os import getenv
from time import sleep

from langchain_anthropic import ChatAnthropic
from langchain_aws import ChatBedrockConverse
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI

from playwright.sync_api import Page
from retry import retry
from selenium.webdriver.remote.webdriver import WebDriver

from .agents import *
from .agents.extractor_agent import Data
from .drivers import PlaywrightDriver, SeleniumDriver
from .models import Model

logger = logging.getLogger(__name__)


class Alumni:
    def __init__(self, driver: Page | WebDriver, model: Model = Model.load()):
        if isinstance(driver, WebDriver):
            self.driver = SeleniumDriver(driver)
        elif isinstance(driver, Page):
            self.driver = PlaywrightDriver(driver)
        else:
            raise NotImplementedError(f"Driver {driver} not implemented")

        logger.info(f"Using model: {model}")
        if model == Model.AZURE_OPENAI:
            llm = AzureChatOpenAI(
                model=model.value,
                api_version=getenv("AZURE_OPENAI_API_VERSION", ""),
                temperature=0,
                seed=1,
            )
        elif model == Model.ANTHROPIC:
            llm = ChatAnthropic(model=model.value, temperature=0)
        elif model == Model.AWS_ANTHROPIC or model == Model.AWS_META:
            llm = ChatBedrockConverse(
                model_id=model.value,
                temperature=0,
                aws_access_key_id=getenv("AWS_ACCESS_KEY", ""),
                aws_secret_access_key=getenv("AWS_SECRET_KEY", ""),
                region_name=getenv("AWS_REGION_NAME", "us-east-1"),
            )
        elif model == Model.GOOGLE:
            llm = ChatGoogleGenerativeAI(model=model.value, temperature=0)
        elif model == Model.OPENAI:
            llm = ChatOpenAI(model=model.value, temperature=0, seed=1)
        else:
            raise NotImplementedError(f"Model {model} not implemented")

        self.actor_agent = ActorAgent(self.driver, llm)
        self.extractor_agent = ExtractorAgent(llm)
        self.planner_agent = PlannerAgent(self.driver, llm)
        self.retrieval_agent = RetrieverAgent(self.driver, llm)

    def quit(self):
        self.driver.quit()

    @retry(tries=2, delay=0.1)
    def do(self, goal: str):
        """
        Executes a series of steps to achieve the given goal.

        Args:
            goal: The goal to be achieved.
        """
        steps = self.planner_agent.invoke(goal)
        for step in steps:
            self.actor_agent.invoke(goal, step)

    def check(self, statement: str, vision: bool = False) -> str:
        """
        Checks a given statement using the verifier.

        Args:
            statement: The statement to be checked.
            vision: A flag indicating whether to use a vision-based verification via a screenshot. Defaults to False.
            retries: The number of retries to check the statement. Defaults to the value set in the LoadingDetectorAgent.

        Returns:
            The summary of verification result.

        Raises:
            AssertionError: If the verification fails.
        """
        result = self.retrieval_agent.invoke(f"Is the following true or false - {statement}", vision)
        actual = self.extractor_agent.invoke(f"true or false", result.response.value)
        assert actual, result.response.explanation
        return result.response.explanation

    def get(self, data: str, vision: bool = False) -> Data:
        """
        Extracts requested data from the page.

        Args:
            data: The data to extract.
            vision: A flag indicating whether to use a vision-based extraction via a screenshot. Defaults to False.

        Returns:
            Data: The extracted data loosely typed to int, float, str, or list of them.
        """
        result = self.retrieval_agent.invoke(data, vision)
        text = f"\n\n{data}: " + result.response.value
        return self.extractor_agent.invoke(data, text)

    def learn(self, goal: str, actions: list[str]):
        """
        Adds a new learning example on what steps should be take to achieve the goal.

        Args:
            goal: The goal to be achieved. Use same format as in `do`.
            actions: A list of actions to achieve the goal.
        """
        self.planner_agent.add_example(goal, actions)
