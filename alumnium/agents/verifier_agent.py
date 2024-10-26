import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.language_models import BaseChatModel

from selenium.webdriver.remote.webdriver import WebDriver

from alumnium.aria import AriaTree
from alumnium.assertions import AssertionResult

logger = logging.getLogger(__name__)


class VerifierAgent:
    with open("alumnium/agents/verifier_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open("alumnium/agents/verifier_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, driver: WebDriver, llm: BaseChatModel):
        self.driver = driver
        llm = llm.with_structured_output(AssertionResult, include_raw=True)

        self.chain = llm

    def invoke(self, statement: str):
        logger.info(f"Starting verification:")
        aria = AriaTree.load(self.driver).to_xml()

        logger.info(f"  -> Statement: {statement}")
        logger.debug(f"  -> ARIA: {aria}")

        message = self.chain.invoke(
            [
                SystemMessage(self.SYSTEM_MESSAGE),
                HumanMessage(
                    [
                        {
                            "type": "text",
                            "text": self.USER_MESSAGE.format(
                                statement=statement,
                                url=self.driver.current_url,
                                title=self.driver.title,
                                aria=aria,
                            ),
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{self.driver.get_screenshot_as_base64()}",
                            },
                        },
                    ]
                ),
            ]
        )

        assertion = message["parsed"]
        logger.info(f"  <- Result: {assertion.result}")
        logger.info(f"  <- Reason: {assertion.reason}")
        logger.info(f'  <- Usage: {message["raw"].usage_metadata}')

        assert assertion.result, assertion.reason
