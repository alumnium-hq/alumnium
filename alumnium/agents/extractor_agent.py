import logging
from pathlib import Path
from typing import Union, List

from langchain_core.language_models import BaseChatModel

from alumnium.drivers import BaseDriver
from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


class ExtractorAgent(BaseAgent):
    LIST_SEPARATOR = "<|sep|>"

    with open(Path(__file__).parent / "extractor_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "extractor_prompts/user.md") as f:
        USER_MESSAGE = f.read()
    with open(Path(__file__).parent / "extractor_prompts/_user_text.md") as f:
        USER_TEXT_FRAGMENT = f.read()

    def __init__(self, driver: BaseDriver, llm: BaseChatModel):
        self.driver = driver
        self.chain = self._with_rate_limit_retry(llm)

    def invoke(self, information: str, vision: bool) -> str:
        logger.info(f"Starting extraction:")
        logger.info(f"  -> Information: {information}")

        aria = self.driver.aria_tree.to_xml()
        prompt = self.USER_MESSAGE.format(information=information)
        if not vision:
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
                ("system", self.SYSTEM_MESSAGE.format(separator=self.LIST_SEPARATOR)),
                ("human", human_messages),
            ]
        )

        logger.info(f"  <- Result: {message.content}")
        logger.info(f"  <- Usage: {message.usage_metadata}")

        return self.__loosely_typecast(message.content)

    def __loosely_typecast(self, value: str) -> Union[str, int, float, bool, List[Union[str, int, float, bool]]]:
        # LLMs sometimes add separator to the start/end.
        value = value.removeprefix(self.LIST_SEPARATOR).removesuffix(self.LIST_SEPARATOR)

        if value.isdigit():
            return int(value)
        elif value.replace(".", "", 1).isdigit():
            return float(value)
        elif value.lower() == "true":
            return True
        elif value.lower() == "false":
            return False
        elif self.LIST_SEPARATOR in value:
            return [self.__loosely_typecast(i) for i in value.split(self.LIST_SEPARATOR) if i != ""]
        else:
            return value
