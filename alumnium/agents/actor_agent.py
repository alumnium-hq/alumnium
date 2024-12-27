import logging
from functools import lru_cache
from pathlib import Path

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate

from alumnium.delayed_runnable import DelayedRunnable
from alumnium.drivers import SeleniumDriver
from alumnium.tools import ALL_TOOLS

logger = logging.getLogger(__name__)


class ActorAgent:
    with open(Path(__file__).parent / "actor_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "actor_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, driver: SeleniumDriver, llm: BaseChatModel):
        self.driver = driver
        llm = llm.bind_tools(list(ALL_TOOLS.values()))

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", self.SYSTEM_MESSAGE),
                ("human", self.USER_MESSAGE),
            ]
        )
        self.chain = prompt | DelayedRunnable(llm)

    def invoke(self, steps: list[str]):
        logger.info(f"Starting actions:")
        logger.info(f"  -> Steps: {steps}")

        aria = self.driver.aria_tree
        aria_xml = aria.to_xml()
        message = self.__prompt("\n- ".join(steps), aria_xml)

        logger.info(f"  <- Tools: {message.tool_calls}")
        logger.info(f"  <- Usage: {message.usage_metadata}")

        # Move to tool itself to avoid hardcoding it's parameters.
        for tool_call in message.tool_calls:
            tool = ALL_TOOLS[tool_call["name"]](**tool_call["args"])
            if "id" in tool.model_fields_set:
                tool.id = aria.cached_ids[tool.id]
            if "from_id" in tool.model_fields_set:
                tool.from_id = aria.cached_ids[tool.from_id]
            if "to_id" in tool.model_fields_set:
                tool.to_id = aria.cached_ids[tool.to_id]

            tool.invoke(self.driver)

    @lru_cache()
    def __prompt(self, steps: str, aria: str):
        return self.chain.invoke({"steps": steps, "aria": aria})
