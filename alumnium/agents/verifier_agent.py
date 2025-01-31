import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from langchain_core.language_models import BaseChatModel

from alumnium.drivers import BaseDriver
from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


@dataclass
class Verification:
    summary: str
    aria: str
    title: str
    url: str
    screenshot: Optional[str]


class VerifierAgent(BaseAgent):
    with open(Path(__file__).parent / "verifier_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "verifier_prompts/user.md") as f:
        USER_MESSAGE = f.read()
    with open(Path(__file__).parent / "verifier_prompts/_user_text.md") as f:
        USER_TEXT_FRAGMENT = f.read()

    def __init__(self, driver: BaseDriver, llm: BaseChatModel):
        self.driver = driver
        self.chain = self._with_rate_limit_retry(llm)

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

        result = message.content
        logger.info(f"  <- Result: {result}")
        logger.info(f"  <- Usage: {message.usage_metadata}")

        return Verification(result, aria, title, url, screenshot)
