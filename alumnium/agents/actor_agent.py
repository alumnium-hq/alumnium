import logging
from functools import lru_cache

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate

from selenium.webdriver.remote.webdriver import WebDriver

from alumnium.aria import AriaTree
from alumnium.tools import ALL_TOOLS


logger = logging.getLogger(__name__)
logger.setLevel(logging.DEBUG)


class ActorAgent:
    with open("alumnium/agents/actor_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open("alumnium/agents/actor_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, driver: WebDriver, llm: BaseChatModel):
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
        aria = AriaTree.load(self.driver)
        aria_xml = aria.to_xml()

        logger.info(f"  -> Goal: {goal}")
        logger.debug(f"  -> ARIA: {aria_xml}")

        message = self.__prompt(goal, aria_xml)

        logger.info(f"  <- tools: {message.tool_calls}")

        # Move to tool itself to avoid hardcoding it's parameters.
        for tool in message.tool_calls:
            args = tool.get("args", {}).copy()
            if "id" in args:
                args["id"] = aria.cached_ids[args["id"]]
            elif "from_id" in args:
                args["from_id"] = aria.cached_ids[args["from_id"]]
            elif "to_id" in args:
                args["to_id"] = aria.cached_ids[args["to_id"]]

            ALL_TOOLS[tool["name"]](**args).invoke(self.driver)

    @lru_cache()
    def __prompt(self, goal: str, aria: str):
        return self.chain.invoke({"goal": goal, "aria": aria})
