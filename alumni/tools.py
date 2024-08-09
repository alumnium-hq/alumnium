# from enum import Enum
from typing import Optional, TypedDict

# from langchain_core.pydantic_v1 import BaseModel, Field
from re import compile
from tracemalloc import start

# from nerodia.driver import WebDriver
# from nerodia.exception import UnknownObjectException

from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.common.action_chains import ActionChains

# Move to Selenium:

from dataclasses import dataclass


@dataclass
class BrowsingContext:
    id: str

    @classmethod
    def from_json(cls, json):
        return cls(
            id=json["context"],
        )


def browsing_context_get_tree():
    cmd_dict = {
        "method": "browsingContext.getTree",
        "params": {},
    }
    r = yield cmd_dict
    print(r)
    return [BrowsingContext.from_json(c) for c in r["contexts"]]


def browsing_context_create():
    cmd_dict = {
        "method": "browsingContext.create",
        "params": {
            "type": "tab",
        },
    }
    r = yield cmd_dict
    return BrowsingContext.from_json(r)


def locate_nodes(driver, context, locator={}, start_node=None):
    cmd_dict = {
        "method": "browsingContext.locateNodes",
        "params": {"context": context.id, "locator": locator},
    }
    if start_node:
        cmd_dict["params"]["startNodes"] = [{"sharedId": start_node.id}]
    r = yield cmd_dict
    nodes = r.get("nodes", [])
    return [WebElement(driver, node["sharedId"]) for node in nodes]


# END

# from .aria import ARIA_ROLE_TO_SELECTOR


# TODO: Let Al fail to locate element and attempt to fix.
# def convert_selectors(aria_role: str, selectors: dict) -> dict:
#     pattern = None
#     if "text" in selectors:
#         pattern = compile(selectors.pop("text"))
#     elif "name" in selectors:
#         pattern = compile(selectors.pop("name"))
#     elif "value" in selectors:
#         pattern = compile(selectors.pop("value"))

#     if pattern:
#         if aria_role == "checkbox":
#             selectors["label"] = pattern
#         elif aria_role == "combobox":
#             selectors["title"] = pattern
#         elif aria_role == "textbox":
#             selectors["placeholder"] = pattern
#         else:
#             selectors["text"] = pattern

#     return selectors


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
    context = driver._websocket_connection.execute(browsing_context_get_tree())[0]
    locator = {"type": "accessibility", "value": {}}
    if name:
        locator["value"]["name"] = name
    if role:
        locator["value"]["role"] = role
    elements = driver._websocket_connection.execute(locate_nodes(driver, context, locator, start_node))
    if elements:
        return elements[0]
    else:
        return None


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
