from contextlib import contextmanager
from time import sleep

from appium.webdriver import Remote
from appium.webdriver.webelement import WebElement
from appium.webdriver.common.appiumby import AppiumBy as By
from appium.webdriver.extensions.action_helpers import ActionHelpers
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys

from alumnium.accessibility import XCUITestAccessibilityTree
from alumnium.logutils import get_logger

from .base_driver import BaseDriver
from .keys import Key

logger = get_logger(__name__)


class AppiumDriver(BaseDriver):
    def __init__(self, driver: Remote):
        self.driver = driver
        self.autoswitch_to_webview = True
        self.delay = 0
        self.hide_keyboard_after_typing = False

    @property
    def accessibility_tree(self) -> XCUITestAccessibilityTree:
        sleep(self.delay)
        return XCUITestAccessibilityTree(self.driver.page_source)

    def click(self, id: int):
        self._find_element(id).click()

    def drag_and_drop(self, from_id: int, to_id: int) -> ActionHelpers:
        self.driver.drag_and_drop(self._find_element(from_id), self._find_element(to_id))

    def press_key(self, key: Key):
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

    def quit(self):
        self.driver.quit()

    @property
    def screenshot(self) -> str:
        return self.driver.get_screenshot_as_base64()

    def select(self, id: int, option: str):
        # TODO: Implement select functionality and the tool
        pass

    def swipe(self, id: int):
        # TODO: Implement swipe functionality and the tool
        pass

    @property
    def title(self) -> str:
        with self.__webview_context() as context:
            if context:
                return self.driver.title
            else:
                return ""

    def type(self, id: int, text: str):
        element = self._find_element(id)
        element.clear()
        element.send_keys(text)
        if self.hide_keyboard_after_typing:
            ActionChains(self.driver).move_to_element(element).move_by_offset(0, -20).click().perform()

    @property
    def url(self) -> str:
        with self.__webview_context() as context:
            if context:
                return self.driver.current_url
            else:
                return ""

    def _find_element(self, id: int) -> WebElement:
        element = self.accessibility_tree.element_by_id(id)
        xpath = f"//{element.type}"

        props = {}
        if element.name:
            props["name"] = element.name
        if element.value:
            props["value"] = element.value
        if element.label:
            props["label"] = element.label

        if props:
            props = [f'@{k}="{v}"' for k, v in props.items()]
            xpath += f"[{' and '.join(props)}]"

        return self.driver.find_element(By.XPATH, xpath)

    @contextmanager
    def __webview_context(self):
        if self.autoswitch_to_webview:
            current_context = self.driver.current_context
            for context in self.driver.contexts:
                if "WEBVIEW" in context:
                    self.driver.switch_to.context(context)
                    yield context
                    self.driver.switch_to.context(current_context)
                    return

        yield None
