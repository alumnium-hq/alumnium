from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate, FewShotChatMessagePromptTemplate
from pydantic import BaseModel, Field

from alumnium.logutils import get_logger
from alumnium.models import Model, Provider

from .base_agent import BaseAgent

logger = get_logger(__name__)


class Plan(BaseModel):
    """Plan of actions to achieve a goal."""

    explanation: str = Field(
        description="Explanation how the actions were determined and why they are related to the goal. "
        + "Always include the goal, actions to achieve it, and their order in the explanation."
    )
    actions: list[str] = Field(description="List of actions to achieve the goal.")


class PlannerAgent(BaseAgent):
    LIST_SEPARATOR = "%SEP%"

    def __init__(self, llm: BaseChatModel):
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

        # Use new structured CoT on Llama
        if Model.current.provider == Provider.AWS_META:
            self.chain = final_prompt | llm.with_structured_output(Plan, include_raw=True)
        else:
            self.chain = final_prompt | llm

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

        message = self._invoke_chain(
            self.chain,
            {"goal": goal, "accessibility_tree": accessibility_tree_xml},
        )

        # Use new structured CoT on Llama
        if Model.current.provider == Provider.AWS_META:
            response = message["parsed"]
            logger.info(f"  <- Result: {response}")
            logger.info(f"  <- Usage: {message['raw'].usage_metadata}")

            return response.actions
        else:
            logger.info(f"  <- Result: {message.content}")
            logger.info(f"  <- Usage: {message.usage_metadata}")

            response = message.content.strip()
            response = response.removeprefix(self.LIST_SEPARATOR).removesuffix(self.LIST_SEPARATOR)

            steps = []
            for step in message.content.split(self.LIST_SEPARATOR):
                step = step.strip()
                if step and step.upper() != "NOOP":
                    steps.append(step)

            return steps
