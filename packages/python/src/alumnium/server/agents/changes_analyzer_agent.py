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

        response = self._invoke_chain(
            self.llm,
            [
                ("system", self.prompts["system"]),
                ("human", self.prompts["user"].format(diff=diff)),
            ],
        )

        content = response.content.replace("\n\n", " ")
        logger.info(f"  <- Result: {content}")
        logger.info(f"  <- Usage: {response.usage}")

        return content
