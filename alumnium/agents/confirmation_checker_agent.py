import logging
from pathlib import Path

from langchain_core.language_models import BaseChatModel

from alumnium.delayed_runnable import DelayedRunnable

logger = logging.getLogger(__name__)


class ConfirmationCheckerAgent:
    with open(Path(__file__).parent / "confirmation_checker_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, llm: BaseChatModel):
        self.chain = DelayedRunnable(llm)

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
