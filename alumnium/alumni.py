import logging
from os import getenv

from langchain_anthropic import ChatAnthropic
from langchain_openai import AzureChatOpenAI, ChatOpenAI
from langchain_google_genai import ChatGoogleGenerativeAI

from retry import retry
from selenium.webdriver.remote.webdriver import WebDriver

from .agents import ActorAgent, VerifierAgent
from .drivers import SeleniumDriver
from .models import Model

logger = logging.getLogger(__name__)


class Alumni:
    def __init__(self, driver: WebDriver, model: Model = Model.load()):
        self.driver = SeleniumDriver(driver)

        if model == Model.AZURE_OPENAI:
            llm = AzureChatOpenAI(
                model=model.value,
                api_version=getenv("AZURE_OPENAI_API_VERSION", ""),
                temperature=0,
                max_retries=2,
                seed=1,
            )
        elif model == Model.ANTHROPIC:
            llm = ChatAnthropic(model=model.value, temperature=0, max_retries=2)
        elif model == Model.GOOGLE:
            llm = ChatGoogleGenerativeAI(model=model.value, temperature=0, max_retries=2)
        elif model == Model.OPENAI:
            llm = ChatOpenAI(model=model.value, temperature=0, max_retries=2, seed=1)
        else:
            raise NotImplementedError(f"Model {model} not implemented")

        self.actor_agent = ActorAgent(self.driver, llm)
        self.verifier_agent = VerifierAgent(self.driver, llm)

    def quit(self):
        self.driver.quit()

    @retry(tries=2, delay=0.1)
    def do(self, goal: str):
        self.actor_agent.invoke(goal)

    def check(self, statement: str, vision: bool = False):
        self.verifier_agent.invoke(statement, vision)
