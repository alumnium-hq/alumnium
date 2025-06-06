from pathlib import Path

from appium.webdriver import Remote
from appium.webdriver.webelement import WebElement
from appium.webdriver.common.appiumby import AppiumBy as By
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.select import Select

from alumnium.accessibility import XCUITestAccessibilityTree
from alumnium.logutils import get_logger

from .base_driver import BaseDriver
from .keys import Key

logger = get_logger(__name__)


class AppiumDriver(BaseDriver):
    def __init__(self, driver: Remote):
        self.driver = driver

    @property
    def aria_tree(self) -> XCUITestAccessibilityTree:
        return XCUITestAccessibilityTree(self.driver.page_source)

    def click(self, id: int):
        self._find_element(id).click()

    def drag_and_drop(self, from_id: int, to_id: int):
        actions = ActionChains(self.driver)
        actions.drag_and_drop(
            self._find_element(from_id),
            self._find_element(to_id),
        ).perform()

    def press_key(self, key: Key):
        if key == Keys.BACKSPACE:
            self.driver.switch_to.active_element.send_keys(Keys.BACKSPACE)
        elif key == Keys.ENTER:
            self.driver.switch_to.active_element.send_keys(Keys.ENTER)
        elif key == Keys.ESCAPE:
            self.driver.switch_to.active_element.send_keys(Keys.ESCAPE)
        elif key == Keys.TAB:
            self.driver.switch_to.active_element.send_keys(Keys.TAB)

    def quit(self):
        self.driver.quit()

    @property
    def screenshot(self) -> str:
        return self.driver.get_screenshot_as_base64()

    def select(self, id: int, option: str):
        element = self._find_element(id)
        # Anthropic chooses to select using option ID, not select ID
        if element.tag_name == "option":
            element = element.find_element(By.XPATH, ".//parent::select")
        Select(element).select_by_visible_text(option)

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
        element = self.aria_tree.element_by_id(id)
        xpath = f"//{element.type}"
        if element.name:
            xpath += f"[@name='{element.name}']"
        elif element.value:
            xpath += f"[@value='{element.value}']"
        elif element.label:
            xpath += f"[@label='{element.label}']"

        return self.driver.find_element(By.XPATH, xpath)
