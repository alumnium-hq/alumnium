from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_core.output_parsers import PydanticToolsParser
from langchain_openai import ChatOpenAI

from nerodia.browser import Browser

from selenium.webdriver.remote.webdriver import WebDriver

from .assertions import AssertionResult
from .aria import AriaTree
from .tools import FUNCTIONS, OPENAI_FUNCTIONS


class Alumni:
    def __init__(self, driver: WebDriver):
        self.browser = Browser(browser=driver)

        llm = ChatOpenAI(
            model="gpt-4o-mini",
            temperature=0,
            max_retries=2,
        )

        self.llm_with_tools = llm.bind_tools(OPENAI_FUNCTIONS)
        self.structured_llm = llm.with_structured_output(AssertionResult)

    def quit(self):
        self.browser.quit()

    def act(self, message):
        aria_tree = AriaTree(self.browser.driver.execute_cdp_cmd("Accessibility.getFullAXTree", {})).to_yaml()
        message = self.llm_with_tools.invoke(
            [
                SystemMessage(
                    "You are a helpful assistant that performs actions to achieve a task on a webpage. You can reason about ARIA tree of the page, locate elements by their label/text and interact with them (click, type, hover, etc).",
                ),
                HumanMessage(
                    f"""
Goal: I create a new new task "There is AI in Al".
Webpage ARIA tree:
```yaml
- textbox:
    name: New Todo Input
```
"""
                ),
                AIMessage(
                    """
[
    type({
        "text": "Hello",
        "aria_role": "textbox",
        "locator": {
            "key": "text",
            "value": "New Todo Input"
        }
    }),
    submit({})
]
"""
                ),
                HumanMessage(
                    f"""
Goal: {message}.
Webpage ARIA tree:
```yaml
{aria_tree}
```
""",
                ),
            ],
        )

        for tool in message.tool_calls:
            FUNCTIONS[tool["name"]](browser=self.browser, **tool.get("args", {}))

    def assess(self, message):
        assertion = self.structured_llm.invoke(
            [
                SystemMessage(
                    "You are a helpful assistant that analyzes a screenshot of a web page and judges whether the statement is truthful or not."
                ),
                HumanMessage(
                    [
                        {
                            "type": "text",
                            "text": f"Is the following statement true: {message}.",
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{self.browser.screenshot.base64()}",
                            },
                        },
                    ]
                ),
            ]
        )
        assert assertion.result, assertion.reason
