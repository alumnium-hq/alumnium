from re import sub

from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate, FewShotChatMessagePromptTemplate
from pydantic import BaseModel, Field

from ...tools.navigate_to_url_tool import NavigateToUrlTool
from ..logutils import get_logger
from ..models import Model, Provider
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
    NAVIGATE_TO_URL_EXAMPLE = """
Example:
Input:
Given the following XML accessibility tree:
```xml
<link href="http://foo.bar/baz" />
```
Outline the actions needed to achieve the following goal: open 'http://foo.bar/baz/123' URL
Output:
Explanation: In order to open URL, I am going to directly navigate to the requested URL.
Actions: ['navigate to "http://foo.bar/baz/123" URL']
""".strip()
    LIST_SEPARATOR = "<SEP>"
    UNSTRUCTURED_OUTPUT_MODELS = [
        Provider.OLLAMA,
    ]

    def __init__(self, llm: BaseChatModel, tools: list[str]):
        super().__init__()
        self.llm = llm

        # Convert tool class names to human-readable names
        # E.g., "NavigateToUrlTool" -> "navigate to url"
        self.tool_names = [sub(r"(?<!^)(?=[A-Z])", " ", tool).lower().replace(" tool", "") for tool in tools]

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

        extra_examples = ""
        if NavigateToUrlTool.__name__ in tools:
            extra_examples = self.NAVIGATE_TO_URL_EXAMPLE

        final_prompt = ChatPromptTemplate.from_messages(
            [
                (
                    "system",
                    self.prompts["system"].format(
                        separator=self.LIST_SEPARATOR,
                        tools=", ".join(self.tool_names),
                        extra_examples=extra_examples,
                    ),
                ),
                self.prompt_with_examples,
                ("human", self.prompts["user"]),
            ]
        )

        if Model.current.provider not in self.UNSTRUCTURED_OUTPUT_MODELS:
            self.chain = final_prompt | llm.with_structured_output(Plan, include_raw=True)
        else:
            self.chain = final_prompt | llm

    def add_example(self, goal: str, actions: list[str]):
        if Model.current.provider in self.UNSTRUCTURED_OUTPUT_MODELS:
            output = self.LIST_SEPARATOR.join(actions)
        else:
            output = actions

        if not self.prompt_with_examples.examples:
            self.prompt_with_examples.examples = []

        self.prompt_with_examples.examples.append(
            {
                "goal": goal,
                "accessibility_tree": "",
                "actions": output,
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

        if Model.current.provider not in self.UNSTRUCTURED_OUTPUT_MODELS:
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
