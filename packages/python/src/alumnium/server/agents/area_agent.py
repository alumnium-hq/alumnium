from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field

from ..logutils import get_logger
from .base_agent import BaseAgent

logger = get_logger(__name__)


class Area(BaseModel):
    """Area of the accessibility tree to use."""

    explanation: str = Field(
        description="Explanation how the area was determined and why it's related to the requested information. "
        + "Always include the requested information and its value in the explanation."
    )
    id: int = Field(description="Identifier of the element that corresponds to the area in the accessibility tree.")


class AreaAgent(BaseAgent):
    def __init__(self, llm: BaseChatModel):
        super().__init__()
        self.chain = llm.with_structured_output(Area, include_raw=True)

    def invoke(self, description: str, accessibility_tree_xml: str) -> dict[str, int | str]:
        logger.info("Starting area detection:")
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

        return {"id": response.structured.id, "explanation": response.structured.explanation}
