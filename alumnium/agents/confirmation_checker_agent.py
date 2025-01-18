import logging
from pathlib import Path

from langchain_core.language_models import BaseChatModel

from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


class ConfirmationCheckerAgent(BaseAgent):
    with open(Path(__file__).parent / "confirmation_checker_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, llm: BaseChatModel):
        self.chain = self._with_rate_limit_retry(llm)

    def invoke(self, statement: str, verification_explanation: str) -> bool:
        logger.info(f"Starting confirmation checking:")

        message = self.chain.invoke(
            [
                (
                    "human",
                    self.USER_MESSAGE.format(
                        statement=statement,
                        verification_explanation=verification_explanation,
                    ),
                ),
            ]
        )

        result = message.content
        logger.info(f"  <- Result: {result}")
        logger.info(f"  <- Usage: {message.usage_metadata}")

        return result == "True"
