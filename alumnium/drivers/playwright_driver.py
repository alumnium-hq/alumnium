from contextlib import contextmanager
from base64 import b64encode
from playwright.sync_api import Page, Error

from alumnium.aria import AriaTree


class PlaywrightDriver:
    CANNOT_FIND_NODE_ERROR = "Could not find node with given id"
    NOT_SELECTABLE_ERROR = "Element is not a <select> element"

    def __init__(self, page: Page):
        self.client = page.context.new_cdp_session(page)
        self.page = page

    @property
    def aria_tree(self) -> AriaTree:
        return AriaTree(self.client.send("Accessibility.getFullAXTree"))

    def click(self, id: int):
        with self._find_element(id) as element:
            element.click()

    def drag_and_drop(self, from_id: int, to_id: int):
        with self._find_element(from_id) as from_element:
            with self._find_element(to_id) as to_element:
                from_element.drag_to(to_element)

    def hover(self, id: int):
        with self._find_element(id) as element:
            element.hover()

    def quit(self):
        self.page.close()

    @property
    def screenshot(self) -> str:
        return b64encode(self.page.screenshot()).decode()

    def select(self, id: int, option: str):
        with self._find_element(id) as element:
            try:
                element.select_option(option)
            except Error as error:
                # Anthropic chooses to select using option ID, not select ID
                if self.NOT_SELECTABLE_ERROR in error.message:
                    element.click()
                else:
                    raise error

    @property
    def title(self) -> str:
        return self.page.title()

    def type(self, id: int, text: str, submit: bool):
        with self._find_element(id) as element:
            element.fill(text)
            if submit:
                self.page.keyboard.press("Enter")

    @property
    def url(self) -> str:
        return self.page.url

    @contextmanager
    def _find_element(self, id: int):
        # Beware!
        self.client.send("DOM.enable")
        self.client.send("DOM.getFlattenedDocument")
        node_ids = self.client.send("DOM.pushNodesByBackendIdsToFrontend", {"backendNodeIds": [id]})
        node_id = node_ids["nodeIds"][0]
        self.client.send(
            "DOM.setAttributeValue",
            {
                "nodeId": node_id,
                "name": "data-alumnium-id",
                "value": str(id),
            },
        )
        yield self.page.locator(f"[data-alumnium-id='{id}']")
        try:
            self.client.send(
                "DOM.removeAttribute",
                {
                    "nodeId": node_id,
                    "name": "data-alumnium-id",
                },
            )
        except Error as error:
            # element can be removed by now
            if self.CANNOT_FIND_NODE_ERROR in error.message:
                pass
            else:
                raise error
