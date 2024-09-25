import logging
import yaml

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate

from selenium.webdriver.remote.webdriver import WebDriver

from alumnium.aria import AriaTree
from alumnium.tools import FUNCTIONS, OPENAI_FUNCTIONS

logger = logging.getLogger(__name__)


class ActorAgent:
    with open("alumnium/agents/actor_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open("alumnium/agents/actor_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, driver: WebDriver, llm: BaseChatModel):
        self.driver = driver
        llm = llm.bind_tools(OPENAI_FUNCTIONS)

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", self.SYSTEM_MESSAGE),
                ("human", self.USER_MESSAGE),
            ]
        )
        self.chain = prompt | llm

    def invoke(self, goal: str):
        logger.info(f"Starting action:")
        aria_tree = AriaTree(self.driver.execute_cdp_cmd("Accessibility.getFullAXTree", {})).to_yaml()

        logger.info(f"  -> Goal: {goal}")
        logger.debug(f"  -> ARIA: {aria_tree}")

        message = self.chain.invoke({"goal": goal, "aria": aria_tree})

        logger.info(f"  <- tools: {message.tool_calls}")

        for tool in message.tool_calls:
            FUNCTIONS[tool["name"]](driver=self.driver, **tool.get("args", {}))
