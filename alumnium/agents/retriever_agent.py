import logging
from pathlib import Path
from string import whitespace
from typing import Optional, TypeAlias, Union

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field

from alumnium.drivers import BaseDriver

from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


Data: TypeAlias = Optional[Union[str, int, float, bool, list[Union[str, int, float, bool]]]]


class RetrievedInformation(BaseModel):
    """Retrieved information."""

    explanation: str = Field(
        description="Explanation how information was retrieved and why it's related to the request."
    )
    value: str = Field(
        description="The precise retrieved information value without additional data. If the information is not present in context, reply NOOP."
    )


class RetrieverAgent(BaseAgent):
    LIST_SEPARATOR = "%SEP%"

    with open(Path(__file__).parent / "retriever_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "retriever_prompts/_user_text.md") as f:
        USER_TEXT_FRAGMENT = f.read()

    def __init__(self, driver: BaseDriver, llm: BaseChatModel):
        self.driver = driver
        self.chain = self._with_retry(
            llm.with_structured_output(
                RetrievedInformation,
                include_raw=True,
            )
        )

    def invoke(self, information: str, vision: bool) -> RetrievedInformation:
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
                ("system", self.SYSTEM_MESSAGE.format(separator=self.LIST_SEPARATOR)),
                ("human", human_messages),
            ]
        )

        response = message["parsed"]
        logger.info(f"  <- Result: {response}")
        logger.info(f"  <- Usage: {message["raw"].usage_metadata}")

        # Remove when we find a way use `Data` in structured output `value`.
        response.value = self.__loosely_typecast(response.value)

        return response

    def __loosely_typecast(self, value: str) -> Data:
        # LLMs sometimes add separator to the start/end.
        value = value.removeprefix(self.LIST_SEPARATOR).removesuffix(self.LIST_SEPARATOR)

        if value.upper() == "NOOP":
            return None
        elif value.isdigit():
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
            return value.strip(f"{whitespace}'\"")
