import logging
from pathlib import Path

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field


logger = logging.getLogger(__name__)


class Response(BaseModel):
    result: bool = Field(description="True if contradiction is detected, False otherwise.")


class ContradictionCheckerAgent:
    with open(Path(__file__).parent / "contradiction_checker_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, llm: BaseChatModel):
        self.chain = llm.with_structured_output(Response, include_raw=True)

    def invoke(self, statement: str, verification_explanation: str) -> bool:
        logger.info(f"Starting contradiction checking:")

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

        result = message["parsed"]
        logger.info(f"  <- Result: {result.result}")
        logger.info(f'  <- Usage: {message["raw"].usage_metadata}')

        return result.result
