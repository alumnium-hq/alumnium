from base64 import b64encode
from contextlib import contextmanager
from pathlib import Path

from playwright.sync_api import Error, Page

from alumnium.accessibility import ChromiumAccessibilityTree
from alumnium.logutils import get_logger
from alumnium.screenshot_utils import get_area_screenshot_from_box_model

from .base_driver import BaseDriver
from .keys import Key

logger = get_logger(__name__)


class PlaywrightDriver(BaseDriver):
    CANNOT_FIND_NODE_ERROR = "Could not find node with given id"
    NOT_SELECTABLE_ERROR = "Element is not a <select> element"
    CONTEXT_WAS_DESTROYED_ERROR = "Execution context was destroyed"

    with open(Path(__file__).parent / "scripts/waiter.js") as f:
        WAITER_SCRIPT = f.read()
    with open(Path(__file__).parent / "scripts/waitFor.js") as f:
        WAIT_FOR_SCRIPT = (
            f"(...scriptArgs) => new Promise((resolve) => "
            f"{{ const arguments = [...scriptArgs, resolve]; {f.read()} }})"
        )

    def __init__(self, page: Page):
        self.client = page.context.new_cdp_session(page)
        self.page = page

    @property
    def accessibility_tree(self) -> ChromiumAccessibilityTree:
        self.wait_for_page_to_load()
        return ChromiumAccessibilityTree(self.client.send("Accessibility.getFullAXTree"))

    def click(self, id: int):
        with self._find_element(id) as element:
            tag_name = element.evaluate("el => el.tagName").lower()
            # Llama often attempts to click options, not select them.
            if tag_name == "option":
                option = element.text_content()
                element.locator("xpath=.//parent::select").select_option(option)
            else:
                element.click()

    def drag_and_drop(self, from_id: int, to_id: int):
        with self._find_element(from_id) as from_element:
            with self._find_element(to_id) as to_element:
                from_element.drag_to(to_element)

    def hover(self, id: int):
        with self._find_element(id) as element:
            element.hover()

    def press_key(self, key: Key):
        self.page.keyboard.press(key.value)

    def quit(self):
        self.page.close()

    @property
    def screenshot(self) -> str:
        return b64encode(self.page.screenshot()).decode()

    def area_screenshot(self, id: int) -> str:
        """
        Take a screenshot of a specific element by ID.

        Uses the Chrome DevTools Protocol's DOM.getBoxModel method to get precise coordinates
        of the element, then crops a full page screenshot to those coordinates.

        Args:
            id: The element ID from the accessibility tree

        Returns:
            Base64 encoded PNG screenshot of the element area
        """
        # Get the backend DOM node ID from accessibility tree
        backend_node_id = self.accessibility_tree.cached_ids.get(id)
        if backend_node_id is None:
            raise ValueError(f"No element found with id={id}")

        try:
            # Enable the DOM domain and get the box model for the element
            self.client.send("DOM.enable", {})
            box_model = self.client.send("DOM.getBoxModel", {"backendNodeId": backend_node_id})
        except Error as e:
            logger.debug(f"Error getting box model for ID {id} (backend ID {backend_node_id}): {e}")
            # If the backend node ID is stale, refresh the accessibility tree
            logger.debug("Refreshing accessibility tree to get updated IDs")
            fresh_tree = ChromiumAccessibilityTree(
                self.client.send("Accessibility.getFullAXTree")
            )
            fresh_backend_node_id = fresh_tree.cached_ids.get(id)
            if fresh_backend_node_id is None:
                raise ValueError(f"No element found with id={id} even after refreshing accessibility tree")

            # Try again with the fresh backend node ID
            box_model = self.client.send("DOM.getBoxModel", {"backendNodeId": fresh_backend_node_id})

        # Take a full page screenshot and use utility to crop it
        full_screenshot = self.page.screenshot()
        logger.info("Taking full screenshot and cropping to element bounds")
        return get_area_screenshot_from_box_model(full_screenshot, box_model)

    def select(self, id: int, option: str):
        with self._find_element(id) as element:
            tag_name = element.evaluate("el => el.tagName").lower()
            # Anthropic chooses to select using option ID, not select ID
            if tag_name == "option":
                element.locator("xpath=.//parent::select").select_option(option)
            else:
                element.select_option(option)

    @property
    def title(self) -> str:
        return self.page.title()

    def type(self, id: int, text: str):
        with self._find_element(id) as element:
            element.fill(text)

    @property
    def url(self) -> str:
        return self.page.url

    @contextmanager
    def _find_element(self, id: int):
        # Beware!
        self.client.send("DOM.enable")
        self.client.send("DOM.getFlattenedDocument")
        node_ids = self.client.send(
            "DOM.pushNodesByBackendIdsToFrontend",
            {"backendNodeIds": [id]},
        )
        node_id = node_ids["nodeIds"][0]
        self.client.send(
            "DOM.setAttributeValue",
            {
                "nodeId": node_id,
                "name": "data-alumnium-id",
                "value": str(id),
            },
        )
        yield self.page.locator(f"css=[data-alumnium-id='{id}']")
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

    def wait_for_page_to_load(self):
        logger.debug("Waiting for page to finish loading:")
        try:
            self.page.evaluate(f"function() {{ {self.WAITER_SCRIPT} }}")
            error = self.page.evaluate(self.WAIT_FOR_SCRIPT)
            if error is not None:
                logger.debug(f"  <- Failed to wait for page to load: {error}")
            else:
                logger.debug("  <- Page finished loading")
        except Error as error:
            if self.CONTEXT_WAS_DESTROYED_ERROR in error.message:
                logger.debug("  <- Page context has changed, retrying")
                self.wait_for_page_to_load()
            else:
                raise error
