from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.support.select import Select

from alumnium.aria import AriaTree


class SeleniumDriver:
    def __init__(self, driver: WebDriver):
        self.driver = driver

    @property
    def aria_tree(self) -> AriaTree:
        return AriaTree(self.driver.execute_cdp_cmd("Accessibility.getFullAXTree", {}))

    def click(self, id: int):
        self._find_element(id).click()

    def drag_and_drop(self, from_id: int, to_id: int):
        actions = ActionChains(self.driver)
        actions.drag_and_drop(self._find_element(from_id), self._find_element(to_id)).perform()

    def hover(self, id: int):
        actions = ActionChains(self.driver)
        actions.move_to_element(self._find_element(id)).perform()

    def quit(self):
        self.driver.quit()

    @property
    def screenshot(self) -> str:
        return self.driver.get_screenshot_as_base64()

    def select(self, id: int, option: str):
        select = Select(self._find_element(id))
        select.select_by_visible_text(option)

    @property
    def title(self) -> str:
        return self.driver.title

    def type(self, id: int, text: str, submit: bool):
        input = [text]
        if submit:
            input.append(Keys.RETURN)

        element = self._find_element(id)
        element.clear()
        element.send_keys(*input)

    @property
    def url(self) -> str:
        return self.driver.current_url

    def _find_element(self, id: int):
        # Beware!
        self.driver.execute_cdp_cmd("DOM.enable", {})
        self.driver.execute_cdp_cmd("DOM.getFlattenedDocument", {})
        node_ids = self.driver.execute_cdp_cmd("DOM.pushNodesByBackendIdsToFrontend", {"backendNodeIds": [id]})
        node_id = node_ids["nodeIds"][0]
        self.driver.execute_cdp_cmd(
            "DOM.setAttributeValue",
            {
                "nodeId": node_id,
                "name": "data-alumnium-id",
                "value": str(id),
            },
        )
        element = self.driver.find_element(By.CSS_SELECTOR, f"[data-alumnium-id='{id}']")
        self.driver.execute_cdp_cmd(
            "DOM.removeAttribute",
            {
                "nodeId": node_id,
                "name": "data-alumnium-id",
            },
        )
        return element
