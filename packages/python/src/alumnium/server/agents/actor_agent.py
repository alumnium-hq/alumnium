from langchain_core.language_models import BaseChatModel
from langchain_core.prompts import ChatPromptTemplate

from ...tools.base_tool import BaseTool
from ...tools.tool_to_schema_converter import convert_tools_to_schemas
from ..logutils import get_logger
from .base_agent import BaseAgent

logger = get_logger(__name__)


class ActorAgent(BaseAgent):
    def __init__(self, llm: BaseChatModel, tools: dict[str, type[BaseTool]]):
        super().__init__()

        prompt = ChatPromptTemplate.from_messages(
            [
                ("system", self.prompts["system"]),
                ("human", self.prompts["user"]),
            ]
        )

        self.chain = prompt | llm.bind_tools(convert_tools_to_schemas(tools))

    def invoke(
        self,
        goal: str,
        step: str,
        accessibility_tree_xml: str,
    ) -> tuple[str, list[dict]]:
        if not step.strip():
            return "", []

        logger.info("Starting action:")
        logger.info(f"  -> Goal: {goal}")
        logger.info(f"  -> Step: {step}")
        logger.debug(f"  -> Accessibility tree: {accessibility_tree_xml}")

        response = self._invoke_chain(
            self.chain,
            {"goal": goal, "step": step, "accessibility_tree": accessibility_tree_xml},
        )

        logger.info(f"  <- Tools: {response.tool_calls}")
        logger.info(f"  <- Usage: {response.usage}")

        return (response.reasoning or "", response.tool_calls)
