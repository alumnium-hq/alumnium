import logging
from pathlib import Path

from langchain_core.language_models import BaseChatModel

from alumnium.drivers import BaseDriver
from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


class RetrievalAgent(BaseAgent):
    with open(Path(__file__).parent / "retrieval_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "retrieval_prompts/_user_text.md") as f:
        USER_TEXT_FRAGMENT = f.read()

    def __init__(self, driver: BaseDriver, llm: BaseChatModel):
        self.driver = driver
        self.chain = self._with_rate_limit_retry(llm)

    def invoke(self, information: str, vision: bool) -> str:
        logger.info(f"Starting retrieval:")
        logger.info(f"  -> Information: {information}")

        aria = self.driver.aria_tree.to_xml()
        prompt = information
        if not vision:
            prompt += "\n"
            prompt += self.USER_TEXT_FRAGMENT.format(aria=aria)

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

        logger.info(f"  <- Result: {message.content}")
        logger.info(f"  <- Usage: {message.usage_metadata}")

        return message.content.strip()
