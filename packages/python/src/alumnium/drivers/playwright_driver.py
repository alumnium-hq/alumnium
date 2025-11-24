from base64 import b64encode
from pathlib import Path

from playwright.sync_api import Error, Page

from ..accessibility import ChromiumAccessibilityTree
from ..server.logutils import get_logger
from ..tools.click_tool import ClickTool
from ..tools.drag_and_drop_tool import DragAndDropTool
from ..tools.hover_tool import HoverTool
from ..tools.press_key_tool import PressKeyTool
from ..tools.select_tool import SelectTool
from ..tools.type_tool import TypeTool
from .base_driver import BaseDriver
from .keys import Key

logger = get_logger(__name__)


class PlaywrightDriver(BaseDriver):
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
        self.supported_tools = {
            ClickTool,
            DragAndDropTool,
            HoverTool,
            PressKeyTool,
            SelectTool,
            TypeTool,
        }

    @property
    def platform(self) -> str:
        return "chromium"

    @property
    def accessibility_tree(self) -> ChromiumAccessibilityTree:
        self.wait_for_page_to_load()
        return ChromiumAccessibilityTree(self.client.send("Accessibility.getFullAXTree"))

    def click(self, id: int):
        element = self.find_element(id)
        tag_name = element.evaluate("el => el.tagName").lower()
        # Llama often attempts to click options, not select them.
        if tag_name == "option":
            option = element.text_content()
            element.locator("xpath=.//parent::select").select_option(option)
        else:
            element.click()

    def drag_and_drop(self, from_id: int, to_id: int):
        from_element = self.find_element(from_id)
        to_element = self.find_element(to_id)
        from_element.drag_to(to_element)

    def hover(self, id: int):
        element = self.find_element(id)
        element.hover()

    def press_key(self, key: Key):
        self.page.keyboard.press(key.value)

    def quit(self):
        self.page.close()

    def back(self):
        self.page.go_back()

    def visit(self, url: str):
        self.page.goto(url)

    @property
    def screenshot(self) -> str:
        return b64encode(self.page.screenshot()).decode()

    def select(self, id: int, option: str):
        element = self.find_element(id)
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
        self.find_element(id).fill(text)

    @property
    def url(self) -> str:
        return self.page.url

    def find_element(self, id: int):
        accessibility_element = self.accessibility_tree.element_by_id(id)
        backend_node_id = accessibility_element.backend_node_id

        # Beware!
        self.client.send("DOM.enable")
        self.client.send("DOM.getFlattenedDocument")
        node_ids = self.client.send("DOM.pushNodesByBackendIdsToFrontend", {"backendNodeIds": [backend_node_id]})
        node_id = node_ids["nodeIds"][0]
        self.client.send(
            "DOM.setAttributeValue",
            {
                "nodeId": node_id,
                "name": "data-alumnium-id",
                "value": str(backend_node_id),
            },
        )
        # TODO: We need to remove the attribute after we are done with the element,
        # but Playwright locator is lazy and we cannot guarantee when it is safe to do so.
        return self.page.locator(f"css=[data-alumnium-id='{backend_node_id}']")

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
