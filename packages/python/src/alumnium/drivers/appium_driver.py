from math import ceil
from time import sleep
from typing import Literal

from appium.webdriver import Remote
from appium.webdriver.common.appiumby import AppiumBy as By
from appium.webdriver.webelement import WebElement
from selenium.common.exceptions import UnknownMethodException
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys

from ..accessibility import UIAutomator2AccessibilityTree, XCUITestAccessibilityTree
from ..server.logutils import get_logger
from ..tools.click_tool import ClickTool
from ..tools.drag_and_drop_tool import DragAndDropTool
from ..tools.press_key_tool import PressKeyTool
from ..tools.type_tool import TypeTool
from .base_driver import BaseDriver
from .keys import Key

logger = get_logger(__name__)


class AppiumDriver(BaseDriver):
    def __init__(self, driver: Remote):
        self.driver = driver
        self.supported_tools = {
            ClickTool,
            DragAndDropTool,
            PressKeyTool,
            TypeTool,
        }
        self.autoswitch_contexts = True
        self.delay: float = 0
        self.hide_keyboard_after_typing = False
        self.double_fetch_page_source = False
        self.platform: Literal["uiautomator2", "xcuitest"]
        if self.driver.capabilities.get("automationName", "").lower() == "uiautomator2":
            self.platform = "uiautomator2"
        else:
            self.platform = "xcuitest"

    @property
    def accessibility_tree(self) -> XCUITestAccessibilityTree | UIAutomator2AccessibilityTree:
        self._ensure_native_app_context()
        sleep(self.delay)
        # Hacky workaround for cloud providers reporting stale page source.
        # Intentionally fetch and discard the page source to refresh internal state.
        if self.double_fetch_page_source:
            _ = self.driver.page_source
        xml_string = self.driver.page_source

        if self.platform == "uiautomator2":
            return UIAutomator2AccessibilityTree(xml_string)
        else:
            return XCUITestAccessibilityTree(xml_string)

    def click(self, id: int):
        self._ensure_native_app_context()
        self.find_element(id).click()

    def drag_and_drop(self, from_id: int, to_id: int):
        self._ensure_native_app_context()
        self.driver.drag_and_drop(self.find_element(from_id), self.find_element(to_id))

    def press_key(self, key: Key):
        self._ensure_native_app_context()
        keys = []
        if key == Key.BACKSPACE:
            keys.append(Keys.BACKSPACE)
        elif key == Key.ENTER:
            keys.append(Keys.ENTER)
        elif key == Key.ESCAPE:
            keys.append(Keys.ESCAPE)
        elif key == Key.TAB:
            keys.append(Keys.TAB)

        ActionChains(self.driver).send_keys(*keys).perform()

    def back(self):
        self.driver.back()

    def visit(self, url: str):
        self.driver.get(url)

    def quit(self):
        self.driver.quit()

    @property
    def screenshot(self) -> str:
        return self.driver.get_screenshot_as_base64()

    def scroll_to(self, id: int):
        if self.platform == "xcuitest":
            element = self.find_element(id)
            self.driver.execute_script("mobile: scrollToElement", {"elementId": element.id})
        else:
            # TODO: Implement scroll functionality on Android
            raise NotImplementedError("scroll_to is not implemented for Android (uiautomator2) yet.")

    @property
    def title(self) -> str:
        self._ensure_webview_context()
        try:
            return self.driver.title
        except UnknownMethodException:
            return ""

    def type(self, id: int, text: str):
        self._ensure_native_app_context()
        element = self.find_element(id)
        element.clear()
        element.send_keys(text)
        if self.hide_keyboard_after_typing and self.driver.is_keyboard_shown():
            self._hide_keyboard()

    @property
    def url(self) -> str:
        self._ensure_webview_context()
        try:
            return self.driver.current_url
        except UnknownMethodException:
            return ""

    def find_element(self, id: int) -> WebElement:
        element = self.accessibility_tree.element_by_id(id)

        if self.platform == "xcuitest":
            # Use iOS Predicate locators for XCUITest
            predicate = f'type == "{element.type}"'

            props = {}
            if element.name:
                props["name"] = element.name
            if element.value:
                props["value"] = element.value
            if element.label:
                props["label"] = element.label

            if props:
                props = [f'{k} == "{v}"' for k, v in props.items()]
                props_str = " AND ".join(props)
                predicate += f" AND {props_str}"

            return self.driver.find_element(By.IOS_PREDICATE, predicate)  # type: ignore[reportReturnType]
        else:
            # Use XPath for UIAutomator2
            xpath = f"//{element.type}"

            props = {}
            if element.androidresourceid:
                props["resource-id"] = element.androidresourceid
            if element.androidtext:
                props["text"] = element.androidtext
            if element.androidcontentdesc:
                props["content-desc"] = element.androidcontentdesc
            if element.androidbounds:
                props["bounds"] = element.androidbounds

            if props:
                props = [f'@{k}="{v}"' for k, v in props.items()]
                xpath += f"[{' and '.join(props)}]"

            return self.driver.find_element(By.XPATH, xpath)  # type: ignore[reportReturnType]

    def execute_script(self, script: str):
        self._ensure_webview_context()
        self.driver.execute_script(script)

    def _ensure_native_app_context(self):
        if not self.autoswitch_contexts:
            return

        if self.driver.current_context != "NATIVE_APP":
            self.driver.switch_to.context("NATIVE_APP")

    def _ensure_webview_context(self):
        if not self.autoswitch_contexts:
            return

        if "WEBVIEW" not in self.driver.current_context:
            for context in self.driver.contexts:
                if "WEBVIEW" in context:
                    self.driver.switch_to.context(context)
                    return

    def _hide_keyboard(self):
        if self.platform == "uiautomator2":
            self.driver.hide_keyboard()
        else:
            # Tap to the top left corner of the keyboard to dismiss it
            keyboard = self.driver.find_element(By.IOS_PREDICATE, 'type == "XCUIElementTypeKeyboard"')
            size = keyboard.size
            actions = ActionChains(self.driver)
            actions.move_to_element(keyboard)
            actions.move_by_offset(-ceil(size["width"] / 2), -ceil(size["height"] / 2))
            actions.click()
            actions.perform()
