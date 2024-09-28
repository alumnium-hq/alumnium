from pydantic import BaseModel, Field

from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.common.keys import Keys


class Coordinates(BaseModel):
    x: float
    y: float

    @classmethod
    def for_element(cls, id: int, driver: WebDriver):
        box = driver.execute_cdp_cmd("DOM.getBoxModel", {"backendNodeId": id})["model"]["border"]
        return cls(
            x=(box[0] + box[4]) / 2,
            y=(box[1] + box[5]) / 2,
        )


class ClickTool(BaseModel):
    """Click an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: WebDriver):
        point = Coordinates.for_element(self.id, driver)
        driver.execute_cdp_cmd(
            "Input.dispatchMouseEvent",
            {"type": "mousePressed", "x": point.x, "y": point.y, "button": "left", "clickCount": 1},
        )
        driver.execute_cdp_cmd(
            "Input.dispatchMouseEvent",
            {"type": "mouseReleased", "x": point.x, "y": point.y, "button": "left", "clickCount": 1},
        )


class DragAndDropTool(BaseModel):
    """Drag one element onto another and drop it."""

    from_id: int = Field(description="Identifier (ID) of element to drag")
    to_id: int = Field(description="Identifier (ID) of element to drop onto")

    def invoke(self, driver: WebDriver):
        drag = Coordinates.for_element(self.from_id, driver)
        drop = Coordinates.for_element(self.to_id, driver)

        driver.execute_cdp_cmd(
            "Input.dispatchMouseEvent",
            {"type": "mousePressed", "x": drag.x, "y": drag.y, "button": "left", "clickCount": 1},
        )
        driver.execute_cdp_cmd(
            "Input.dispatchMouseEvent",
            {"type": "mouseMoved", "x": drop.x, "y": drop.y, "button": "left", "clickCount": 1},
        )
        driver.execute_cdp_cmd(
            "Input.dispatchMouseEvent",
            {"type": "mouseReleased", "x": drop.x, "y": drop.y, "button": "left", "clickCount": 1},
        )


class HoverTool(BaseModel):
    """Hover an element."""

    id: int = Field(description="Element identifier (ID)")

    def invoke(self, driver: WebDriver):
        point = Coordinates.for_element(self.id, driver)
        driver.execute_cdp_cmd(
            "Input.dispatchMouseEvent", {"type": "mouseMoved", "x": point.x, "y": point.y, "button": "left"}
        )


class TypeTool(BaseModel):
    """Type text into an element."""

    id: int = Field(description="Element identifier (ID)")
    text: str = Field(description="Text to type into an element")
    submit: bool = Field(
        description="Submit after typing text by pressing `Enter` key. Set to True when you are asked to perform the action on the page that requires typing text to the form and there is no button on the page to submit the form."
    )

    def invoke(self, driver: WebDriver):
        driver.execute_cdp_cmd("DOM.focus", {"backendNodeId": self.id})
        input = [self.text]
        if self.submit:
            input.append(Keys.RETURN)

        element = driver.switch_to.active_element
        element.clear()
        element.send_keys(*input)


ALL_TOOLS = {
    "ClickTool": ClickTool,
    "DragAndDropTool": DragAndDropTool,
    "HoverTool": HoverTool,
    "TypeTool": TypeTool,
}
