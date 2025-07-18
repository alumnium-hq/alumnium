from string import whitespace
from typing import Optional, TypeAlias, Union

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field

from alumnium.accessibility import BaseAccessibilityTree
from alumnium.drivers import BaseDriver
from alumnium.logutils import get_logger

from .base_agent import BaseAgent

logger = get_logger(__name__)


Data: TypeAlias = Optional[Union[str, int, float, bool, list[Union[str, int, float, bool]]]]


class RetrievedInformation(BaseModel):
    """Retrieved information."""

    explanation: str = Field(
        description="Explanation how information was retrieved and why it's related to the requested information."
        + "Always include the requested information and its value in the explanation."
    )
    value: str = Field(
        description="The precise retrieved information value without additional data. If the information is not"
        + "present in context, reply NOOP."
    )


class RetrieverAgent(BaseAgent):
    LIST_SEPARATOR = "%SEP%"

    def __init__(self, driver: BaseDriver, llm: BaseChatModel):
        super().__init__()
        self.driver = driver
        self.chain = self._with_retry(
            llm.with_structured_output(
                RetrievedInformation,
                include_raw=True,
            )
        )

    def invoke(
        self,
        information: str,
        vision: bool,
        accessibility_tree: Optional[BaseAccessibilityTree] = None,
    ) -> RetrievedInformation:
        logger.info("Starting retrieval:")
        logger.info(f"  -> Information: {information}")

        if accessibility_tree:
            accessibility_tree = accessibility_tree.to_xml()
        else:
            accessibility_tree = self.driver.accessibility_tree.to_xml()

        title = self.driver.title
        url = self.driver.url

        logger.debug(f"  -> Accessibility tree: {accessibility_tree}")
        logger.debug(f"  -> Title: {title}")
        logger.debug(f"  -> URL: {url}")

        prompt = ""
        if not vision:
            prompt += self.prompts["_user_text"].format(accessibility_tree=accessibility_tree, title=title, url=url)
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
                ("system", self.prompts["system"].format(separator=self.LIST_SEPARATOR)),
                ("human", human_messages),
            ]
        )

        response = message["parsed"]

        logger.info(f"  <- Result: {response}")
        logger.info(f"  <- Usage: {message['raw'].usage_metadata}")
        self._update_usage(message["raw"].usage_metadata)

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
