import logging
from dataclasses import dataclass
from pathlib import Path
from typing import Optional

from langchain_core.language_models import BaseChatModel

from alumnium.drivers import BaseDriver
from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


@dataclass
class RetrievalResult:
    response: str
    aria: str
    title: str
    url: str
    screenshot: Optional[str]


class RetrieverAgent(BaseAgent):
    with open(Path(__file__).parent / "retriever_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "retriever_prompts/_user_text.md") as f:
        USER_TEXT_FRAGMENT = f.read()

    def __init__(self, driver: BaseDriver, llm: BaseChatModel):
        self.driver = driver
        self.chain = self._with_retry(llm)

    def invoke(self, information: str, vision: bool) -> RetrievalResult:
        logger.info(f"Starting retrieval:")
        logger.info(f"  -> Information: {information}")

        aria = self.driver.aria_tree.to_xml()
        title = self.driver.title
        url = self.driver.url

        prompt = ""
        if not vision:
            prompt += self.USER_TEXT_FRAGMENT.format(aria=aria, title=title, url=url)
        prompt += "\n"
        prompt += information

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

        response = message.content.strip()
        logger.info(f"  <- Result: {response}")
        logger.info(f"  <- Usage: {message.usage_metadata}")

        return RetrievalResult(response, aria, title, url, screenshot)
