import logging
from pathlib import Path

from langchain_core.language_models import BaseChatModel
from pydantic import BaseModel, Field


logger = logging.getLogger(__name__)


class Loading(BaseModel):
    """Result of determining whether a page is loading or being changed dynamically in any other way."""

    result: bool = Field(description="Whether the page is loading or being changed dynamically in any other way.")
    explanation: str = Field(description="Reason for the result.")


class LoadingDetectorAgent:
    with open(Path(__file__).parent / "loading_detector_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open(Path(__file__).parent / "loading_detector_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    delay = 0.5
    timeout = 5

    def __init__(self, llm: BaseChatModel):
        llm = llm.with_structured_output(Loading, include_raw=True)
        self.chain = llm

    def invoke(self, aria: str, title: str, url: str, screenshot: str = ""):
        logger.info(f"Starting loading detection:")

        human_messages = [
            {
                "type": "text",
                "text": self.USER_MESSAGE.format(url=url, title=title, aria=aria),
            }
        ]

        if screenshot:
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

        loading = message["parsed"]
        logger.info(f"  <- Result: {loading.result}")
        logger.info(f"  <- Reason: {loading.explanation}")
        logger.info(f'  <- Usage: {message["raw"].usage_metadata}')

        return loading.result
