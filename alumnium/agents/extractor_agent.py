import logging
from pathlib import Path
from typing import Union, TypeAlias

from langchain_core.language_models import BaseChatModel

from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


class ExtractorAgent(BaseAgent):
    Data: TypeAlias = Union[str, int, float, bool, list[Union[str, int, float, bool]]]

    LIST_SEPARATOR = "<|sep|>"

    with open(Path(__file__).parent / "extractor_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "extractor_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, llm: BaseChatModel):
        self.chain = self._with_rate_limit_retry(llm)

    def invoke(self, data: str, text: str) -> Data:
        logger.info(f"Starting extraction:")
        logger.info(f"  -> Data: {data}")

        message = self.chain.invoke(
            [
                ("system", self.SYSTEM_MESSAGE.format(separator=self.LIST_SEPARATOR)),
                ("human", self.USER_MESSAGE.format(data=data, text=text)),
            ]
        )

        logger.info(f"  <- Result: {message.content}")
        logger.info(f"  <- Usage: {message.usage_metadata}")

        return self.__loosely_typecast(message.content)

    def __loosely_typecast(self, value: str) -> Data:
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
            return value.strip()
