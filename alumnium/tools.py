from pydantic import BaseModel, Field

from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.select import Select
from selenium.webdriver.remote.webdriver import WebDriver


def _find_element(backend_node_id: int, driver: WebDriver):
    driver.execute_cdp_cmd("DOM.enable", {})
    driver.execute_cdp_cmd("DOM.getFlattenedDocument", {})
    node_ids = driver.execute_cdp_cmd("DOM.pushNodesByBackendIdsToFrontend", {"backendNodeIds": [backend_node_id]})
    node_id = node_ids["nodeIds"][0]
    driver.execute_cdp_cmd(
        "DOM.setAttributeValue",
        {
            "nodeId": node_id,
            "name": "data-alumnium-id",
            "value": str(backend_node_id),
        },
    )
    element = driver.find_element(By.CSS_SELECTOR, f"[data-alumnium-id='{backend_node_id}']")
    driver.execute_cdp_cmd(
        "DOM.removeAttribute",
        {
            "nodeId": node_id,
            "name": "data-alumnium-id",
        },
    )
    return element


class ClickTool(BaseModel):
    """Click an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: WebDriver):
        _find_element(self.id, driver).click()


class DragAndDropTool(BaseModel):
    """Drag one element onto another and drop it."""

    from_id: int = Field(description="Identifier (ID) of element to drag")
    to_id: int = Field(description="Identifier (ID) of element to drop onto")

    def invoke(self, driver: WebDriver):
        actions = ActionChains(driver)
        actions.drag_and_drop(_find_element(self.from_id, driver), _find_element(self.to_id, driver)).perform()


class HoverTool(BaseModel):
    """Hover an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: WebDriver):
        actions = ActionChains(driver)
        actions.move_to_element(_find_element(self.id, driver)).perform()


class SelectTool(BaseModel):
    """Selects an option in a dropdown."""

    id: int = Field(description="Element identifier (ID)")
    option: str = Field(description="Option to select.")

    def invoke(self, driver: WebDriver):
        Select(_find_element(self.id, driver)).select_by_visible_text(self.option)


class TypeTool(BaseModel):
    """Types text into an element."""

    id: int = Field(description="Element identifier (ID)")
    text: str = Field(description="Text to type into an element")
    submit: bool = Field(description="Submit after typing text by pressing `Enter` key")

    def invoke(self, driver: WebDriver):
        input = [self.text]
        if self.submit:
            input.append(Keys.RETURN)

        element = _find_element(self.id, driver)
        element.clear()
        element.send_keys(*input)


ALL_TOOLS = {
    "ClickTool": ClickTool,
    "DragAndDropTool": DragAndDropTool,
    "HoverTool": HoverTool,
    "SelectTool": SelectTool,
    "TypeTool": TypeTool,
}
