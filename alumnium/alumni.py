import logging

from langchain_core.messages import AIMessage, HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from langchain_anthropic import ChatAnthropic
from langchain_google_genai import ChatGoogleGenerativeAI

from nerodia.browser import Browser
from selenium.webdriver.remote.webdriver import WebDriver

from .assertions import AssertionResult
from .aria import AriaTree
from .models import Model
from .tools import FUNCTIONS, OPENAI_FUNCTIONS

logger = logging.getLogger(__name__)


class Alumni:
    def __init__(self, driver: WebDriver, model: Model = Model.OPEN_AI):
        self.driver = driver

        if model == Model.OPEN_AI:
            llm = ChatOpenAI(
                model="gpt-4o-mini",
                temperature=0,
                max_retries=2,
            )
        elif model == Model.ANTHROPIC:
            llm = ChatAnthropic(
                model="claude-3-5-sonnet-20240620",
                temperature=0,
                max_retries=2,
            )
        elif model == Model.GOOGLE:
            llm = ChatGoogleGenerativeAI(
                model="gemini-1.5-flash",
                temperature=0,
                max_retries=2,
            )

        self.llm_with_tools = llm.bind_tools(OPENAI_FUNCTIONS)
        self.structured_llm = llm.with_structured_output(AssertionResult)

    def quit(self):
        self.driver.quit()

    def act(self, message):
        logger.info(f"Starting action:")
        aria_tree = AriaTree(self.driver.execute_cdp_cmd("Accessibility.getFullAXTree", {})).to_yaml()

        logger.info(f"  -> message: {message}")
        logger.debug(f"  -> ARIA: {aria_tree}")

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
        "submit": true,
        "aria_role": "textbox",
        "aria_name": "New Todo Input"
    }),
]
"""
                ),
                HumanMessage(
                    f"""
Goal: I complete the "There is AI in Al" task.
Webpage ARIA tree:
```yaml
- listitem:
    ignored: false
    level: 1
    name: ''
    nodes:
    - none:
        ignored: true
        name: ''
        nodes:
        - checkbox:
            checked: 'false'
            focusable: true
            ignored: false
            invalid: 'false'
            name: ''
        - LabelText:
            ignored: false
            name: ''
            nodes:
            - StaticText:
                ignored: false
                name: There is AI in Al
                nodes:
                - InlineTextBox:
                    ignored: false
                    name: ''
```
"""
                ),
                AIMessage(
                    """
[
    click({
        "aria_role": "checkbox",
        "inside": {
            "aria_role": "listitem",
            "aria_name": "There is AI in Al"
        }
    })
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

        logger.info(f"  <- tools: {message.tool_calls}")

        for tool in message.tool_calls:
            FUNCTIONS[tool["name"]](driver=self.driver, **tool.get("args", {}))

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
                            "text": f"""
Based on the screenshot and information about the webpage, is the following statement true: {message}.

URL: {self.driver.current_url}
Title: {self.driver.title}
                           """,
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
