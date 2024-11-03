import logging
from functools import lru_cache
from pathlib import Path

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate

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
        self.chain = prompt | llm

    def invoke(self, goal: str):
        logger.info(f"Starting action:")
        logger.info(f"  -> Goal: {goal}")

        aria = self.driver.aria_tree
        aria_xml = aria.to_xml()
        message = self.__prompt(goal, aria_xml)

        logger.info(f"  <- Tools: {message.tool_calls}")
        logger.info(f"  <- Usage: {message.usage_metadata}")

        # Move to tool itself to avoid hardcoding it's parameters.
        for tool in message.tool_calls:
            args = tool.get("args", {}).copy()
            if "id" in args:
                args["id"] = aria.cached_ids[args["id"]]
            if "from_id" in args:
                args["from_id"] = aria.cached_ids[args["from_id"]]
            if "to_id" in args:
                args["to_id"] = aria.cached_ids[args["to_id"]]

            ALL_TOOLS[tool["name"]](**args).invoke(self.driver)

    @lru_cache()
    def __prompt(self, goal: str, aria: str):
        return self.chain.invoke({"goal": goal, "aria": aria})
