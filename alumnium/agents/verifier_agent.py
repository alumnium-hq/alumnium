import logging
from pathlib import Path

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field

from alumnium.drivers import SeleniumDriver

logger = logging.getLogger(__name__)


class Verification(BaseModel):
    """Result of a verification of a statement on a webpaget."""

    result: bool = Field(description="Result of the verification.")
    explanation: str = Field(description="Reason for the verification result.")


class VerifierAgent:
    with open(Path(__file__).parent / "verifier_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "verifier_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, driver: SeleniumDriver, llm: BaseChatModel):
        self.driver = driver
        llm = llm.with_structured_output(Verification, include_raw=True)

        self.chain = llm

    def invoke(self, statement: str, vision: bool = False):
        logger.info(f"Starting verification:")
        logger.info(f"  -> Statement: {statement}")

        human_messsages = [
            {
                "type": "text",
                "text": self.USER_MESSAGE.format(
                    statement=statement,
                    url=self.driver.url,
                    title=self.driver.title,
                    aria=self.driver.aria_tree.to_xml(),
                ),
            }
        ]

        if vision:
            human_messsages.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{self.driver.screenshot}",
                    },
                }
            )

        message = self.chain.invoke(
            [
                ("system", self.SYSTEM_MESSAGE),
                ("human", human_messsages),
            ]
        )

        verification = message["parsed"]
        logger.info(f"  <- Result: {verification.result}")
        logger.info(f"  <- Reason: {verification.explanation}")
        logger.info(f'  <- Usage: {message["raw"].usage_metadata}')

        assert verification.result, verification.explanation
