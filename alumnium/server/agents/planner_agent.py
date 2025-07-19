from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate, FewShotChatMessagePromptTemplate

from alumnium.logutils import *
from alumnium.logutils import get_logger

from .base_agent import BaseAgent

logger = get_logger(__name__)


class PlannerAgent(BaseAgent):
    LIST_SEPARATOR = "%SEP%"

    def __init__(self, llm: BaseChatModel = None):
        super().__init__()
        self.llm = llm

        example_prompt = ChatPromptTemplate.from_messages(
            [
                ("human", self.prompts["user"]),
                ("ai", "{actions}"),
            ]
        )
        self.prompt_with_examples = FewShotChatMessagePromptTemplate(
            examples=[],
            example_prompt=example_prompt,
        )
        final_prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    self.prompts["system"].format(separator=self.LIST_SEPARATOR),
                ),
                self.prompt_with_examples,
                ("human", self.prompts["user"]),
            ]
        )

        self.chain = final_prompt | self._with_retry(llm)

    def add_example(self, goal: str, actions: list[str]):
        self.prompt_with_examples.examples.append(
            {
                "goal": goal,
                "accessibility_tree": "",
                "actions": self.LIST_SEPARATOR.join(actions),
            }
        )

    def invoke(self, goal: str, accessibility_tree_xml: str) -> list[str]:
        """
        Plan actions to achieve a goal.

        Args:
            goal: The goal to achieve
            accessibility_tree_xml: The accessibility tree XML (required).
        """
        logger.info("Starting planning:")
        logger.info(f"  -> Goal: {goal}")
        logger.debug(f"  -> Accessibility tree: {accessibility_tree_xml}")
        message = self.chain.invoke({"goal": goal, "accessibility_tree": accessibility_tree_xml})

        logger.info(f"  <- Result: {message.content}")
        logger.info(f"  <- Usage: {message.usage_metadata}")
        self._update_usage(message.usage_metadata)

        response = message.content.strip()
        response = response.removeprefix(self.LIST_SEPARATOR).removesuffix(self.LIST_SEPARATOR)

        steps = []
        for step in message.content.split(self.LIST_SEPARATOR):
            step = step.strip()
            if step and step.upper() != "NOOP":
                steps.append(step)

        return steps
