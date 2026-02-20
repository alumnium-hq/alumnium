from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field

from ..logutils import get_logger
from .base_agent import BaseAgent

logger = get_logger(__name__)


class Locator(BaseModel):
    """Element locator in the accessibility tree."""

    explanation: str = Field(
        description="Explanation how the element was identified and why it matches the description. "
        + "Always include the description and the matching element in the explanation."
    )
    id: int = Field(description="Identifier of the element that matches the description in the accessibility tree.")


class LocatorAgent(BaseAgent):
    def __init__(self, llm: BaseChatModel):
        super().__init__()
        self.chain = llm.with_structured_output(Locator, include_raw=True)

    def invoke(self, description: str, accessibility_tree_xml: str) -> list[dict[str, int | str]]:
        logger.info("Starting element location:")
        logger.info(f"  -> Description: {description}")
        logger.debug(f"  -> Accessibility tree: {accessibility_tree_xml}")

        response = self._invoke_chain(
            self.chain,
            [
                ("system", self.prompts["system"]),
                (
                    "human",
                    self.prompts["user"].format(
                        accessibility_tree=accessibility_tree_xml,
                        description=description,
                    ),
                ),
            ],
        )

        logger.info(f"  <- Result: {response.structured}")
        logger.info(f"  <- Usage: {response.usage}")

        return [{"id": response.structured.id, "explanation": response.structured.explanation}]
