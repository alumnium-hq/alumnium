from base64 import b64encode
from contextlib import contextmanager
from os import getenv
from pathlib import Path

from playwright.sync_api import Error, Locator, Page, TimeoutError

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
    NEW_TAB_TIMEOUT = int(getenv("ALUMNIUM_PLAYWRIGHT_NEW_TAB_TIMEOUT", "200"))
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
        self._wait_for_page_to_load()
        return ChromiumAccessibilityTree(self._send_cdp_command("Accessibility.getFullAXTree"))

    def click(self, id: int):
        element = self.find_element(id)
        tag_name = element.evaluate("el => el.tagName").lower()
        # Llama often attempts to click options, not select them.
        if tag_name == "option":
            option = element.text_content()
            element.locator("xpath=.//parent::select").select_option(option)
        else:
            with self._autoswitch_to_new_tab():
                element.click(force=True)

    def drag_and_drop(self, from_id: int, to_id: int):
        from_element = self.find_element(from_id)
        to_element = self.find_element(to_id)
        from_element.drag_to(to_element)

    def hover(self, id: int):
        element = self.find_element(id)
        element.hover()

    def press_key(self, key: Key):
        with self._autoswitch_to_new_tab():
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

    def scroll_to(self, id: int):
        element = self.find_element(id)
        element.scroll_into_view_if_needed()

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
        element = self.find_element(id)
        input_type = element.get_attribute("type")
        text = self._normalize_input_text(input_type, text)
        if input_type == "file":
            element.set_input_files(text)
        else:
            element.fill(text)

    @property
    def url(self) -> str:
        return self.page.url

    def find_element(self, id: int) -> Locator:
        accessibility_element = self.accessibility_tree.element_by_id(id)
        backend_node_id = accessibility_element.backend_node_id

        # Beware!
        self._send_cdp_command("DOM.enable")
        self._send_cdp_command("DOM.getFlattenedDocument")
        node_ids = self._send_cdp_command(
            "DOM.pushNodesByBackendIdsToFrontend",
            {
                "backendNodeIds": [backend_node_id],
            },
        )
        node_id = node_ids["nodeIds"][0]
        self._send_cdp_command(
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

    def execute_script(self, script: str):
        self.page.evaluate(f"() => {{ {script} }}")

    def _wait_for_page_to_load(self):
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
                self._wait_for_page_to_load()
            else:
                raise error

    @contextmanager
    def _autoswitch_to_new_tab(self):
        try:
            with self.page.context.expect_page(timeout=self.NEW_TAB_TIMEOUT) as new_page_info:
                yield
        except TimeoutError:
            return
        page = new_page_info.value
        logger.debug(f"Auto-switching to new tab {page.title()} ({page.url})")
        self.page = page
        self.client = page.context.new_cdp_session(page)

    def _send_cdp_command(self, method: str, params: dict | None = None):
        return self.client.send(method, params or {})
