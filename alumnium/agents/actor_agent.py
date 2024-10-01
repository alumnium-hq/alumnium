import logging

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
        aria = AriaTree.load(self.driver).to_xml()

        logger.info(f"  -> Goal: {goal}")
        logger.debug(f"  -> ARIA: {aria}")

        message = self.chain.invoke({"goal": goal, "aria": aria})

        logger.info(f"  <- tools: {message.tool_calls}")

        for tool in message.tool_calls:
            ALL_TOOLS[tool["name"]](**tool.get("args", {})).invoke(self.driver)
