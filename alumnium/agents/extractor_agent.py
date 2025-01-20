import logging
from functools import lru_cache
from pathlib import Path

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate

from alumnium.drivers import BaseDriver
from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


class ExtractorAgent(BaseAgent):
    with open(Path(__file__).parent / "extractor_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "extractor_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, driver: BaseDriver, llm: BaseChatModel):
        self.driver = driver

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", self.SYSTEM_MESSAGE),
                ("human", self.USER_MESSAGE),
            ]
        )

        self.chain = prompt | self._with_rate_limit_retry(llm)

    def invoke(self, information: str) -> list[str]:
        logger.info(f"Starting extraction:")
        logger.info(f"  -> Information: {information}")

        aria = self.driver.aria_tree
        aria_xml = aria.to_xml()
        message = self.__prompt(information, aria_xml)

        logger.info(f"  <- Result: {message.content.strip()}")
        logger.info(f"  <- Usage: {message.usage_metadata}")

        return message.content.strip()

    @lru_cache()
    def __prompt(self, information: str, aria: str):
        return self.chain.invoke({"information": information, "aria": aria})
