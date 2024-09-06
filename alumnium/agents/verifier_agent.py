import logging

from langchain_core.messages import HumanMessage, SystemMessage
from langchain_core.language_models import BaseChatModel

from selenium.webdriver.remote.webdriver import WebDriver

from alumnium.assertions import AssertionResult

logger = logging.getLogger(__name__)


class VerifierAgent:
    with open("alumnium/agents/verifier_prompts/system.md") as f:
        SYSTEM_MESSAGE = f.read()
    with open("alumnium/agents/verifier_prompts/user.md") as f:
        USER_MESSAGE = f.read()

    def __init__(self, driver: WebDriver, llm: BaseChatModel):
        self.driver = driver
        llm = llm.with_structured_output(AssertionResult)

        self.chain = llm

    def invoke(self, statement: str):
        assertion = self.chain.invoke(
            [
                SystemMessage(self.SYSTEM_MESSAGE),
                HumanMessage(
                    [
                        {
                            "type": "text",
                            "text": self.USER_MESSAGE.format(
                                statement=statement, url=self.driver.current_url, title=self.driver.title
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
        assert assertion.result, assertion.reason
