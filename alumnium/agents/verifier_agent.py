import logging

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

    def invoke(self, statement: str, vision: bool = False):
        logger.info(f"Starting verification:")
        aria = AriaTree.load(self.driver).to_xml()

        logger.info(f"  -> Statement: {statement}")
        logger.debug(f"  -> ARIA: {aria}")

        human_messsages = [
            {
                "type": "text",
                "text": self.USER_MESSAGE.format(
                    statement=statement,
                    url=self.driver.current_url,
                    title=self.driver.title,
                    aria=aria,
                ),
            }
        ]

        if vision:
            human_messsages.append(
                {
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{self.driver.get_screenshot_as_base64()}",
                    },
                }
            )

        message = self.chain.invoke(
            [
                ("system", self.SYSTEM_MESSAGE),
                ("human", human_messsages),
            ]
        )

        assertion = message["parsed"]
        logger.info(f"  <- Result: {assertion.result}")
        logger.info(f"  <- Reason: {assertion.reason}")
        logger.info(f'  <- Usage: {message["raw"].usage_metadata}')

        assert assertion.result, assertion.reason
