from pathlib import Path

from appium.webdriver import Remote
from appium.webdriver.webelement import WebElement
from appium.webdriver.common.appiumby import AppiumBy as By

from alumnium.accessibility import XCUITestAccessibilityTree
from alumnium.logutils import get_logger

from .base_driver import BaseDriver
from .keys import Key

logger = get_logger(__name__)


class AppiumDriver(BaseDriver):
    def __init__(self, driver: Remote):
        self.driver = driver

    @property
    def accessibility_tree(self) -> XCUITestAccessibilityTree:
        return XCUITestAccessibilityTree(self.driver.page_source)

    def click(self, id: int):
        self._find_element(id).click()

    def drag_and_drop(self, from_id: int, to_id: int):
        # TODO: Implement drag and drop functionality
        pass

    def hover(self, id: int):
        # TODO: Remove hover tool, it's not supported in Appium
        pass

    def press_key(self, key: Key):
        # TODO: Implement press key functionality
        pass

    def quit(self):
        self.driver.quit()

    @property
    def screenshot(self) -> str:
        return self.driver.get_screenshot_as_base64()

    def select(self, id: int, option: str):
        # TODO: Implement select functionality
        pass

    def swipe(self, id: int):
        # TODO: Implement swipe functionality and the tool
        pass

    @property
    def title(self) -> str:
        return ""

    def type(self, id: int, text: str):
        element = self._find_element(id)
        element.clear()
        element.send_keys(text)

    @property
    def url(self) -> str:
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
