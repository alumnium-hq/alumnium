import logging
from functools import lru_cache
from pathlib import Path

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate
from pydantic import BaseModel, Field

from alumnium.delayed_runnable import DelayedRunnable
from alumnium.drivers import SeleniumDriver

logger = logging.getLogger(__name__)


class Plan(BaseModel):
    """Plan for achieving a goal."""

    possible: bool = Field(description="Is it possible to achieve the goal?")
    steps: list[str] = Field(description="A list of steps to be performed if it's possible to achieve the goal.")


class PlannerAgent:
    with open(Path(__file__).parent / "planner_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "planner_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, driver: SeleniumDriver, llm: BaseChatModel):
        self.driver = driver

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", self.SYSTEM_MESSAGE),
                ("human", self.USER_MESSAGE),
            ]
        )
        self.chain = prompt | DelayedRunnable(llm.with_structured_output(Plan, include_raw=True))

    def invoke(self, goal: str) -> list[str]:
        logger.info(f"Starting planning:")
        logger.info(f"  -> Goal: {goal}")

        aria = self.driver.aria_tree
        aria_xml = aria.to_xml()
        message = self.__prompt(goal, aria_xml)

        logger.info(message)
        result = message["parsed"]
        logger.info(f"  <- Result: {result}")
        logger.info(f'  <- Usage: {message["raw"].usage_metadata}')

        return result.steps

    @lru_cache()
    def __prompt(self, goal: str, aria: str):
        return self.chain.invoke({"goal": goal, "aria": aria})
