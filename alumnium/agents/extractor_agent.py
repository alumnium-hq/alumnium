import logging
from pathlib import Path

from langchain_core.language_models import BaseChatModel

from alumnium.drivers import BaseDriver
from .base_agent import BaseAgent

logger = logging.getLogger(__name__)


class ExtractorAgent(BaseAgent):
    with open(Path(__file__).parent / "extractor_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "extractor_prompts/user.md") as f:
        USER_MESSAGE = f.read()
    with open(Path(__file__).parent / "extractor_prompts/_user_text.md") as f:
        USER_TEXT_FRAGMENT = f.read()

    def __init__(self, driver: BaseDriver, llm: BaseChatModel):
        self.driver = driver
        self.llm = llm

    def invoke(self, information: str, type: type, vision: bool) -> str:
        logger.info(f"Starting extraction:")
        logger.info(f"  -> Information: {information}")
        logger.info(f"  -> Type: {type}")

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

        chain = self._with_rate_limit_retry(
            self.llm.with_structured_output(
                {
                    "description": "Data",  # Anthropic needs those.
                    "properties": {
                        "value": self.__convert_type_to_json_schema(type)
                        | {
                            "description": "Extracted information.",
                            "title": "Value",
                        }
                    },
                    "required": ["value"],
                    "title": "Information",
                    "type": "object",
                },
                include_raw=True,
            )
        )
        message = chain.invoke(
            [
                ("system", self.SYSTEM_MESSAGE),
                ("human", human_messages),
            ]
        )

        logger.info(f"  <- Result: {message["parsed"]}")
        logger.info(f"  <- Usage: {message["raw"].usage_metadata}")

        response = message["parsed"]
        if isinstance(response, list):
            response = response[0] or {}

        return response.get("value", None) or response.get("args", {}).get("value", None)

    def __convert_type_to_json_schema(self, type: type) -> dict:
        default = {"description": "Data."}  # Anthropic needs those

        if type.__name__ == "str":
            return {"type": "string"} | default
        elif type.__name__ == "int":
            return {"type": "integer"} | default
        elif type.__name__ == "float":
            return {"type": "number"} | default
        elif type.__name__ == "bool":
            return {"type": "boolean"} | default
        elif type.__name__ == "list":
            return {
                "type": "array",
                "items": self.__convert_type_to_json_schema(type.__args__[0]),
            } | default
        else:
            raise ValueError(f"Type {type} not supported")
