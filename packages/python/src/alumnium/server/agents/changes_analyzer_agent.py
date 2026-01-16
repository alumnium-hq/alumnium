from langchain_core.language_models import BaseChatModel

from ..logutils import get_logger
from .base_agent import BaseAgent

logger = get_logger(__name__)


class ChangesAnalyzerAgent(BaseAgent):
    def __init__(self, llm: BaseChatModel):
        super().__init__()
        self.llm = llm

    def invoke(self, diff: str) -> str:
        logger.info("Starting changes analysis:")
        logger.debug(f"  -> Diff: {diff}")

        message = self._invoke_chain(  # type: ignore[assignment]
            self.llm,
            [
                ("system", self.prompts["system"]),
                ("human", self.prompts["user"].format(diff=diff)),
            ],
        )

        content = message.text.replace("\n\n", " ")  # type: ignore[reportAttributeAccessIssue]
        logger.info(f"  <- Result: {content}")
        logger.info(f"  <- Usage: {message.usage_metadata}")  # type: ignore[reportAttributeAccessIssue]

        return content
