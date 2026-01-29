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
        element = self.find_element(id)
        self._scroll_into_view(element)
        element.click()

    def drag_and_drop(self, from_id: int, to_id: int):
        self._ensure_native_app_context()
        from_element = self.find_element(from_id)
        to_element = self.find_element(to_id)
        self._scroll_into_view(from_element)
        self.driver.drag_and_drop(from_element, to_element)

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
        element = self.find_element(id)
        self._scroll_into_view(element)

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
        self._scroll_into_view(element)
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

            logger.debug(f"Finding element by predicate: {predicate}")
            return self.driver.find_element(By.IOS_PREDICATE, predicate)  # type: ignore[reportReturnType]
        else:
            # Use XPath for UIAutomator2
            xpath = f"//{element.type}"

            props = {}
            if element.androidresourceid:
                props["resource-id"] = element.androidresourceid
            if element.androidbounds:
                props["bounds"] = element.androidbounds

            if props:
                props = [f'@{k}="{v}"' for k, v in props.items()]
                xpath += f"[{' and '.join(props)}]"

            logger.debug(f"Finding element by xpath: {xpath}")
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

        for context in reversed(self.driver.contexts):
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

    def _scroll_into_view(self, element: WebElement):
        if self.platform == "uiautomator2":
            self._scroll_into_view_android(element)
        else:
            self.driver.execute_script("mobile: scrollToElement", {"elementId": element.id})

    def _scroll_into_view_android(self, element: WebElement, max_scrolls: int = 10, direction: str = "up"):
        """
        Scroll to element on Android using swipe gestures.
        Implementation based on WebDriverIO's scrollIntoView for native mobile apps.

        Args:
            element: The WebElement to scroll to
            max_scrolls: Maximum number of swipe attempts (default: 10)
            direction: Scroll direction - "up" scrolls content down, "down" scrolls content up (default: "up")
        """
        if element.is_displayed():
            return

        # Calculate swipe coordinates based on direction
        window_size = self.driver.get_window_size()
        width = window_size["width"]
        height = window_size["height"]
        # Use center horizontal position and 20% to 80% vertical range
        center_x = width // 2
        start_y = int(height * 0.8) if direction == "up" else int(height * 0.2)
        end_y = int(height * 0.2) if direction == "up" else int(height * 0.8)

        for scroll_count in range(max_scrolls):
            try:
                if element.is_displayed():
                    logger.debug(f"Element scrolled into view after {scroll_count} swipes")
                    return
            except Exception as e:
                # Element might be stale, continue scrolling
                logger.debug(f"Element check failed: {e}")

            logger.debug(f"Performing swipe {scroll_count + 1}/{max_scrolls} in direction '{direction}'")
            self.driver.swipe(center_x, start_y, center_x, end_y, duration=300)
            sleep(0.1)

        # Element still not visible after max scrolls
        logger.warning(
            f"Element not visible after {max_scrolls} scrolls. "
            f"Try adjusting the scroll direction or increase max_scrolls."
        )

    def switch_to_next_tab(self):
        raise NotImplementedError("Tab switching not supported for this driver")

    def switch_to_previous_tab(self):
        raise NotImplementedError("Tab switching not supported for this driver")
