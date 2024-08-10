# from enum import Enum
from typing import Optional, TypedDict

# from langchain_core.pydantic_v1 import BaseModel, Field
from re import I, compile
from tracemalloc import start

from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains

from .locators import XPath


# The functions needs to be re-written in Pydantic v2 syntax (see below)
# but unfortunately the resulting OpenAI schema is incorrect. Notably,
# the `locator` and `inside` fields should be of type `object` but they
# are being converted to `allOf` with `properties` and `required` fields.
# This forces LLM to generate both `locator` and `inside` fields in the
# generated tool calls, though we explicitly tell that `locator` can be
# empty if `inside` is used.


def _find_element(
    driver: WebDriver, role: str, name: Optional[str] = None, start_node: Optional[WebElement] = None
) -> WebElement:
    if not start_node:
        start_node = driver

    return start_node.find_element(By.XPATH, str(XPath(role, name)))


def click(driver: WebDriver, aria_role: str, aria_name: Optional[str] = None, inside: dict[str, str] = {}):
    selectors = {"role": aria_role}
    if aria_name:
        selectors["name"] = aria_name

    if inside:
        parent = {"role": inside["aria_role"]}
        if inside.get("aria_name", None):
            selectors["name"] = aria_name
        selectors["start_node"] = _find_element(driver, **parent)

    _find_element(driver, **selectors).click()


def open_url(driver: WebDriver, url: str):
    driver.get(url)


def type(driver: WebDriver, text: str, aria_role: str, aria_name: Optional[str] = None, inside: dict[str, str] = {}):
    selectors = {"role": aria_role}
    if aria_name:
        selectors["name"] = aria_name

    if inside:
        parent = {"role": inside["aria_role"]}
        if inside.get("aria_name", None):
            selectors["name"] = aria_name
        selectors["start_node"] = _find_element(driver, **parent)

    _find_element(driver, **selectors).send_keys(text)


def submit(driver: WebDriver):
    element = driver.switch_to.active_element
    element.send_keys(Keys.RETURN)


def hover(driver: WebDriver, aria_role: str, aria_name: Optional[str] = None, inside: dict[str, str] = {}):
    selectors = {"role": aria_role}
    if aria_name:
        selectors["name"] = aria_name

    if inside:
        parent = {"role": inside["aria_role"]}
        if inside.get("aria_name", None):
            selectors["name"] = aria_name
        selectors["start_node"] = _find_element(driver, **parent)

    actions = ActionChains(driver)
    actions.move_to_element(_find_element(driver, **selectors))
    actions.perform()


FUNCTIONS = {"click": click, "open_url": open_url, "type": type, "submit": submit, "hover": hover}

OPENAI_FUNCTIONS = [
    {
        "name": "click",
        "description": "Clicks an element.",
        "parameters": {
            "type": "object",
            "properties": {
                "aria_role": {"type": "string", "description": "Element ARIA role (checkbox, textbox, button, etc.)"},
                "aria_name": {"type": "string", "description": "Element ARIA name"},
                "inside": {
                    "type": "object",
                    "description": "Parent element containing the element to click",
                    "properties": {
                        "aria_role": {
                            "type": "string",
                            "description": "Element ARIA role (checkbox, textbox, button, etc.)",
                        },
                        "aria_name": {"type": "string", "description": "Element ARIA name"},
                    },
                },
            },
            "required": ["aria_role"],
        },
    },
    {
        "name": "type",
        "description": "Type text into an element.",
        "parameters": {
            "type": "object",
            "properties": {
                "text": {"type": "string", "description": "Text to type into an element"},
                "aria_role": {"type": "string", "description": "Element ARIA role (checkbox, textbox, button, etc.)"},
                "aria_name": {"type": "string", "description": "Element ARIA name"},
                "inside": {
                    "type": "object",
                    "description": "Parent element containing the element to click",
                    "properties": {
                        "aria_role": {
                            "type": "string",
                            "description": "Element ARIA role (checkbox, textbox, button, etc.)",
                        },
                        "aria_name": {"type": "string", "description": "Element ARIA name"},
                    },
                },
            },
            "required": ["text", "aria_role"],
        },
    },
    {
        "name": "submit",
        "description": "Submit by pressing `Enter` key.",
        "parameters": {"type": "object", "properties": {}, "required": []},
    },
    {
        "name": "open_url",
        "description": "Open a URL in the driver.",
        "parameters": {
            "type": "object",
            "properties": {
                "url": {"type": "string", "description": "URL to open"},
            },
            "required": ["url"],
        },
    },
    {
        "name": "hover",
        "description": "Hovers an element.",
        "parameters": {
            "type": "object",
            "properties": {
                "aria_role": {"type": "string", "description": "Element ARIA role (checkbox, textbox, button, etc.)"},
                "aria_name": {"type": "string", "description": "Element ARIA name"},
                "inside": {
                    "type": "object",
                    "description": "Parent element containing the element to click",
                    "properties": {
                        "aria_role": {
                            "type": "string",
                            "description": "Element ARIA role (checkbox, textbox, button, etc.)",
                        },
                        "aria_name": {"type": "string", "description": "Element ARIA name"},
                    },
                },
            },
            "required": ["aria_role"],
        },
    },
]


# class Locator(BaseModel):
#     """Element locator."""

#     class Key(str, Enum):
#         """Key to locate the element."""

#         text = "text"

#     key: Key
#     value: str


# class Element(BaseModel):
#     aria_role: str = Field(description="Element ARIA role (checkbox, textbox, button, etc.)")
#     locator: Optional[Locator] = Field(
#         default=None,
#         description="Locator to find element to click. Can be empty if `inside` parameter is used.",
#     )


# class ClickTool(BaseModel):
#     """Click an element."""

#     aria_role: str = Field(description="Element ARIA role (checkbox, textbox, button, etc.)")
#     locator: Optional[Locator] = Field(
#         default=None,
#         description="Locator to find element to click. Can be null if `inside` parameter is used.",
#     )
#     inside: Optional[Element] = Field(default=None, description="Parent element containing the element to click.")

#     def call(self, driver: WebDriver):
#         locator = ARIA_ROLE_TO_SELECTOR[self.aria_role]
#         if self.locator:
#             locator[self.locator["key"].value] = self.locator["value"]

#         parent = {}
#         if self.inside:
#             parent = ARIA_ROLE_TO_SELECTOR[self.inside["aria_role"]]
#             if self.inside["locator"]:
#                 parent[self.inside["locator"]["key"].value] = self.inside["locator"]["value"]

#         if parent:
#             driver.element(**parent).element(**locator).click()
#         else:
#             driver.element(**locator).click()


# class OpenURLTool(BaseModel):
#     """Open a URL in the driver."""

#     url: str = Field(description="URL to open")

#     def call(self, driver: WebDriver):
#         driver.goto(self.url)


# class TypeTool(BaseModel):
#     """Type text into an element."""

#     text: str = Field(description="Text to type")
#     aria_role: str = Field(description="Element ARIA role (checkbox, textbox, button, etc.)")
#     locator: Optional[Locator] = Field(
#         default=None,
#         description="Locator to find element to click. Can be empty if `inside` parameter is used.",
#     )
#     inside: Optional[Element] = Field(default=None, description="Parent element containing the element to click.")

#     def call(self, driver: WebDriver):
#         locator = ARIA_ROLE_TO_SELECTOR[self.aria_role]
#         if self.locator:
#             locator[self.locator["key"].value] = self.locator["value"]

#         parent = {}
#         if self.inside:
#             parent = ARIA_ROLE_TO_SELECTOR[self.inside["aria_role"]]
#             if self.inside["locator"]:
#                 parent[self.inside["locator"]["key"].value] = self.inside["locator"]["value"]

#         if parent:
#             driver.element(**parent).element(**locator).set(self.text)
#         else:
#             driver.element(**locator).set(self.text)


# class SubmitTool(BaseModel):
#     """Submit the active form by pressing Enter key. Useful after typing text into a textbox."""

#     def call(self, driver: WebDriver):
#         driver.send_keys(Keys.RETURN)


# ALL_TOOLS = [ClickTool, OpenURLTool, TypeTool, SubmitTool]
