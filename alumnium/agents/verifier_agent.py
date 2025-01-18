import logging
from pathlib import Path
from time import sleep

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field

from alumnium.agents import LoadingDetectorAgent
from alumnium.drivers import SeleniumDriver
from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


class Verification(BaseModel):
    """Result of a verification of a statement on a webpage."""

    result: bool = Field(description="Result of the verification.")
    explanation: str = Field(description="Reason for the verification result.")


class VerifierAgent(BaseAgent):
    with open(Path(__file__).parent / "verifier_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "verifier_prompts/user.md") as f:
        USER_MESSAGE = f.read()
    with open(Path(__file__).parent / "verifier_prompts/_user_text.md") as f:
        USER_TEXT_FRAGMENT = f.read()

    def __init__(self, driver: SeleniumDriver, llm: BaseChatModel):
        self.driver = driver

        self.chain = self._with_rate_limit_retry(
            llm.with_structured_output(
                Verification,
                include_raw=True,
            )
        )

        self.loading_detector_agent = LoadingDetectorAgent(llm)
        self.retry_count = LoadingDetectorAgent.timeout / LoadingDetectorAgent.delay

    def invoke(self, statement: str, vision: bool = False) -> Verification:
        logger.info(f"Starting verification:")
        logger.info(f"  -> Statement: {statement}")

        aria = self.driver.aria_tree.to_xml()
        title = self.driver.title
        url = self.driver.url

        prompt = self.USER_MESSAGE.format(statement=statement)
        if not vision:
            prompt += self.USER_TEXT_FRAGMENT.format(url=url, title=title, aria=aria)

        human_messages = [{"type": "text", "text": prompt}]

        screenshot = None
        if vision:
            screenshot = self.driver.screenshot
            human_messages.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{screenshot}",
                    },
                }
            )

        message = self.chain.invoke(
            [
                ("system", self.SYSTEM_MESSAGE),
                ("human", human_messages),
            ]
        )

        verification = message["parsed"]
        logger.info(f"  <- Result: {verification.result}")
        logger.info(f"  <- Reason: {verification.explanation}")
        logger.info(f'  <- Usage: {message["raw"].usage_metadata}')

        if not verification.result:
            loading = self.loading_detector_agent.invoke(aria, title, url, screenshot)
            if loading and self.retry_count > 0:
                sleep(LoadingDetectorAgent.delay)
                self.retry_count -= 1
                return self.invoke(statement, vision)

        return verification
