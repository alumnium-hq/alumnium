import logging
from functools import lru_cache
from pathlib import Path

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate, FewShotChatMessagePromptTemplate

from alumnium.delayed_runnable import DelayedRunnable
from alumnium.drivers import SeleniumDriver

logger = logging.getLogger(__name__)


class PlannerAgent:
    with open(Path(__file__).parent / "planner_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "planner_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, driver: SeleniumDriver, llm: BaseChatModel):
        self.driver = driver

        example_prompt = ChatPromptTemplate.from_messages(
            [
                ("human", self.USER_MESSAGE),
                ("ai", "{actions}"),
            ]
        )
        self.prompt_with_examples = FewShotChatMessagePromptTemplate(
            examples=[],
            example_prompt=example_prompt,
        )
        final_prompt = ChatPromptTemplate.from_messages(
            [
                ("system", self.SYSTEM_MESSAGE),
                self.prompt_with_examples,
                ("human", self.USER_MESSAGE),
            ]
        )

        self.chain = final_prompt | DelayedRunnable(llm)

    def add_example(self, goal: str, actions: list[str]):
        self.prompt_with_examples.examples.append(
            {
                "goal": goal,
                "aria": "",
                "actions": "\n".join([f"- {action}" for action in actions]),
            }
        )

    def invoke(self, goal: str) -> list[str]:
        logger.info(f"Starting planning:")
        logger.info(f"  -> Goal: {goal}")

        aria = self.driver.aria_tree
        aria_xml = aria.to_xml()
        message = self.__prompt(goal, aria_xml)

        logger.info(f"  <- Result: {message.content}")
        logger.info(f"  <- Usage: {message.usage_metadata}")

        if message.content.upper() == "NOOP":
            return []
        else:
            steps = message.content.split("\n")
            return [step.removeprefix("- ") for step in steps]

    @lru_cache()
    def __prompt(self, goal: str, aria: str):
        return self.chain.invoke({"goal": goal, "aria": aria})
