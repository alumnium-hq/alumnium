# from enum import Enum
# from typing import Optional, TypedDict

# from langchain_core.pydantic_v1 import BaseModel, Field
from re import compile

from nerodia.browser import Browser
from nerodia.exception import UnknownObjectException

from selenium.webdriver.common.keys import Keys

from .aria import ARIA_ROLE_TO_SELECTOR


# TODO: Let Al fail to locate element and attempt to fix.
def convert_selectors(aria_role: str, selectors: dict) -> dict:
    pattern = None
    if "text" in selectors:
        pattern = compile(selectors.pop("text"))
    elif "name" in selectors:
        pattern = compile(selectors.pop("name"))
    elif "value" in selectors:
        pattern = compile(selectors.pop("value"))

    if pattern:
        if aria_role == "checkbox":
            selectors["label"] = pattern
        elif aria_role == "combobox":
            selectors["title"] = pattern
        elif aria_role == "textbox":
            selectors["placeholder"] = pattern
        else:
            selectors["text"] = pattern

    return selectors


# The functions needs to be re-written in Pydantic v2 syntax (see below)
# but unfortunately the resulting OpenAI schema is incorrect. Notably,
# the `locator` and `inside` fields should be of type `object` but they
# are being converted to `allOf` with `properties` and `required` fields.
# This forces LLM to generate both `locator` and `inside` fields in the
# generated tool calls, though we explicitly tell that `locator` can be
# empty if `inside` is used.


def click(browser: Browser, aria_role: str, locator: dict = {}, inside: dict = {}):
    selectors = ARIA_ROLE_TO_SELECTOR.get(aria_role, {})
    if locator:
        selectors[locator["key"]] = locator["value"]

    selectors = convert_selectors(aria_role, selectors)

    parent = {}
    if inside:
        parent = ARIA_ROLE_TO_SELECTOR.get(inside["aria_role"], {})
        if inside.get("locator", {}):
            parent[inside["locator"]["key"]] = inside["locator"]["value"]
        parent = convert_selectors(inside["aria_role"], parent)

    context = browser
    if parent:
        context = browser.element(**parent)

    context.element(**selectors).click()


def open_url(browser: Browser, url: str):
    browser.goto(url)


def type(browser: Browser, text: str, aria_role: str, locator: dict = {}, inside: dict = {}):
    selectors = ARIA_ROLE_TO_SELECTOR.get(aria_role, {})
    if locator:
        selectors[locator["key"]] = locator["value"]

    selectors = convert_selectors(aria_role, selectors)

    parent = {}
    if inside:
        parent = ARIA_ROLE_TO_SELECTOR.get(inside["aria_role"], {})
        if inside.get("locator", {}):
            parent[inside["locator"]["key"]] = inside["locator"]["value"]
        parent = convert_selectors(inside["aria_role"], parent)

    if parent:
        browser.element(**parent).element(**selectors).to_subtype().set(text)
    else:
        browser.element(**selectors).to_subtype().set(text)


def submit(browser: Browser):
    browser.send_keys(Keys.RETURN)


def hover(browser: Browser, aria_role: str, locator: dict = {}, inside: dict = {}):
    selectors = ARIA_ROLE_TO_SELECTOR.get(aria_role, {})
    if locator:
        selectors[locator["key"]] = locator["value"]

    parent = {}
    if inside:
        parent = ARIA_ROLE_TO_SELECTOR.get(inside["aria_role"], {})
        if inside.get("locator", {}):
            parent[inside["locator"]["key"]] = inside["locator"]["value"]
        parent = convert_selectors(inside["aria_role"], parent)

    if parent:
        browser.element(**parent).element(**selectors).hover()
    else:
        browser.element(**selectors).hover()


FUNCTIONS = {"click": click, "open_url": open_url, "type": type, "submit": submit, "hover": hover}

OPENAI_FUNCTIONS = [
    {
        "name": "click",
        "description": "Clicks an element.",
        "parameters": {
            "type": "object",
            "properties": {
                "aria_role": {"type": "string", "description": "Element ARIA role (checkbox, textbox, button, etc.)"},
                "locator": {
                    "type": "object",
                    "description": "Locator to find element to click. Can be empty if `inside` parameter is used.",
                    "properties": {
                        "key": {
                            "type": "string",
                            "description": "Locator type (label, text, etc.).",
                            "enum": ["text"],
                        },
                        "value": {"type": "string", "description": "Locator value"},
                    },
                },
                "inside": {
                    "type": "object",
                    "description": "Parent element containing the element to click",
                    "properties": {
                        "aria_role": {
                            "type": "string",
                            "description": "Element ARIA role (checkbox, textbox, button, etc.)",
                        },
                        "locator": {
                            "type": "object",
                            "properties": {
                                "key": {
                                    "type": "string",
                                    "description": "Locator type (label, text, etc.).",
                                    "enum": ["text"],
                                },
                                "value": {"type": "string", "description": "Locator value"},
                            },
                        },
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
                "locator": {
                    "type": "object",
                    "description": "Locator to find element to type into. Can be empty if `inside` parameter is used.",
                    "properties": {
                        "key": {
                            "type": "string",
                            "description": "Locator type (label, text, etc.).",
                            "enum": ["text"],
                        },
                        "value": {"type": "string", "description": "Locator value"},
                    },
                },
                "inside": {
                    "type": "object",
                    "description": "Parent element containing the element to type into",
                    "properties": {
                        "aria_role": {
                            "type": "string",
                            "description": "Element ARIA role (checkbox, textbox, button, etc.)",
                        },
                        "locator": {
                            "type": "object",
                            "properties": {
                                "key": {
                                    "type": "string",
                                    "description": "Locator type (label, text, etc.).",
                                    "enum": ["text"],
                                },
                                "value": {"type": "string", "description": "Locator value"},
                            },
                        },
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
        "description": "Open a URL in the browser.",
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
                "locator": {
                    "type": "object",
                    "description": "Locator to find element to hover. Can be empty if `inside` parameter is used.",
                    "properties": {
                        "key": {
                            "type": "string",
                            "description": "Locator type (label, text, etc.).",
                            "enum": ["text"],
                        },
                        "value": {"type": "string", "description": "Locator value"},
                    },
                },
                "inside": {
                    "type": "object",
                    "description": "Parent element containing the element to hover",
                    "properties": {
                        "aria_role": {
                            "type": "string",
                            "description": "Element ARIA role (checkbox, textbox, button, etc.)",
                        },
                        "locator": {
                            "type": "object",
                            "properties": {
                                "key": {
                                    "type": "string",
                                    "description": "Locator type (label, text, etc.).",
                                    "enum": ["text"],
                                },
                                "value": {"type": "string", "description": "Locator value"},
                            },
                        },
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

#     def call(self, browser: Browser):
#         locator = ARIA_ROLE_TO_SELECTOR[self.aria_role]
#         if self.locator:
#             locator[self.locator["key"].value] = self.locator["value"]

#         parent = {}
#         if self.inside:
#             parent = ARIA_ROLE_TO_SELECTOR[self.inside["aria_role"]]
#             if self.inside["locator"]:
#                 parent[self.inside["locator"]["key"].value] = self.inside["locator"]["value"]

#         if parent:
#             browser.element(**parent).element(**locator).click()
#         else:
#             browser.element(**locator).click()


# class OpenURLTool(BaseModel):
#     """Open a URL in the browser."""

#     url: str = Field(description="URL to open")

#     def call(self, browser: Browser):
#         browser.goto(self.url)


# class TypeTool(BaseModel):
#     """Type text into an element."""

#     text: str = Field(description="Text to type")
#     aria_role: str = Field(description="Element ARIA role (checkbox, textbox, button, etc.)")
#     locator: Optional[Locator] = Field(
#         default=None,
#         description="Locator to find element to click. Can be empty if `inside` parameter is used.",
#     )
#     inside: Optional[Element] = Field(default=None, description="Parent element containing the element to click.")

#     def call(self, browser: Browser):
#         locator = ARIA_ROLE_TO_SELECTOR[self.aria_role]
#         if self.locator:
#             locator[self.locator["key"].value] = self.locator["value"]

#         parent = {}
#         if self.inside:
#             parent = ARIA_ROLE_TO_SELECTOR[self.inside["aria_role"]]
#             if self.inside["locator"]:
#                 parent[self.inside["locator"]["key"].value] = self.inside["locator"]["value"]

#         if parent:
#             browser.element(**parent).element(**locator).set(self.text)
#         else:
#             browser.element(**locator).set(self.text)


# class SubmitTool(BaseModel):
#     """Submit the active form by pressing Enter key. Useful after typing text into a textbox."""

#     def call(self, browser: Browser):
#         browser.send_keys(Keys.RETURN)


# ALL_TOOLS = [ClickTool, OpenURLTool, TypeTool, SubmitTool]
