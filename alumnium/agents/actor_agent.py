from typing import Optional

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate

from alumnium.accessibility import BaseAccessibilityTree
from alumnium.drivers import AppiumDriver, BaseDriver
from alumnium.logutils import *
from alumnium.tools import ALL_APPIUM_TOOLS, ALL_TOOLS
from alumnium.logutils import get_logger

from .base_agent import BaseAgent

logger = get_logger(__name__)


class ActorAgent(BaseAgent):
    def __init__(self, driver: BaseDriver, llm: BaseChatModel):
        super().__init__()

        self.driver = driver
        if isinstance(self.driver, AppiumDriver):
            llm = llm.bind_tools(list(ALL_APPIUM_TOOLS.values()))
        else:
            llm = llm.bind_tools(list(ALL_TOOLS.values()))
        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", self.prompts["system"]),
                ("human", self.prompts["user"]),
            ]
        )

        self.chain = prompt | self._with_retry(llm)

    def invoke(self, goal: str, step: str, accessibility_tree: Optional[BaseAccessibilityTree] = None):
        if not step.strip():
            return

        logger.info("Starting action:")
        logger.info(f"  -> Goal: {goal}")
        logger.info(f"  -> Step: {step}")

        if not accessibility_tree:
            accessibility_tree = self.driver.accessibility_tree
        accessibility_tree_xml = accessibility_tree.to_xml()

        logger.debug(f"  -> Accessibility tree: {accessibility_tree_xml}")
        message = self.chain.invoke({"goal": goal, "step": step, "accessibility_tree": accessibility_tree_xml})

        logger.info(f"  <- Tools: {message.tool_calls}")
        logger.info(f"  <- Usage: {message.usage_metadata}")
        self._update_usage(message.usage_metadata)
        # Move to tool itself to avoid hardcoding it's parameters.
        for tool_call in message.tool_calls:
            tool = ALL_TOOLS[tool_call["name"]](**tool_call["args"])
            if "id" in tool.model_fields_set:
                tool.id = accessibility_tree.element_by_id(tool.id).id
            if "from_id" in tool.model_fields_set:
                tool.from_id = accessibility_tree.element_by_id(tool.from_id).id
            if "to_id" in tool.model_fields_set:
                tool.to_id = accessibility_tree.element_by_id(tool.to_id).id

            tool.invoke(self.driver)
