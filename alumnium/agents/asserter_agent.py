import logging
from pathlib import Path

from langchain_core.language_models import BaseChatModel

from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


class AsserterAgent(BaseAgent):
    with open(Path(__file__).parent / "asserter_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "asserter_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, llm: BaseChatModel):
        self.chain = self._with_rate_limit_retry(llm)

    def invoke(self, statement: str, text: str) -> bool:
        logger.info(f"Starting asserting:")
        logger.info(f"  -> Statement: {statement}")

        message = self.chain.invoke(
            [
                ("system", self.SYSTEM_MESSAGE),
                ("human", self.USER_MESSAGE.format(statement=statement, text=text)),
            ]
        )

        result = message.content.strip().lower()
        logger.info(f"  <- Result: {result}")
        logger.info(f"  <- Usage: {message.usage_metadata}")

        return result == "true"
