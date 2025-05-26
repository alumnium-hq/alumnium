from pathlib import Path

from appium.webdriver import Remote
from appium.webdriver.webelement import WebElement
from appium.webdriver.common.appiumby import AppiumBy as By

from alumnium.accessibility import XCUITestAccessibilityTree
from alumnium.logutils import ALUMNIUM_LOG_PATH, console_output, file_output

from .base_driver import BaseDriver
from .keys import Key

if ALUMNIUM_LOG_PATH == "stdout":
    logger = console_output()
else:
    logger = file_output()


class AppiumDriver(BaseDriver):
    def __init__(self, driver: Remote):
        self.driver = driver

    @property
    def aria_tree(self) -> XCUITestAccessibilityTree:
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
        return "'"

    def _find_element(self, id: int) -> WebElement:
        element = self.aria_tree.element_by_id(str(id))
        xpath = f"//{element['type']}"
        if element["name"]:
            xpath += f"[@name='{element['name']}']"
        elif element["value"]:
            xpath += f"[@value='{element['value']}']"
        elif element["label"]:
            xpath += f"[@label='{element['label']}']"

        return self.driver.find_element(By.XPATH, xpath)
