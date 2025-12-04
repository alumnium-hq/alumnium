import asyncio
from base64 import b64encode
from contextlib import asynccontextmanager
from pathlib import Path

from playwright._impl._errors import TimeoutError
from playwright.async_api import Error, Locator, Page

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


class AsyncPlaywrightDriver(BaseDriver):
    """
    Playwright driver that uses async API internally but exposes synchronous interface.

    This driver runs async Playwright operations in a dedicated thread with its own event loop,
    allowing it to be used within the synchronous Alumni/BaseDriver architecture.
    """

    NEW_TAB_TIMEOUT = 200
    NOT_SELECTABLE_ERROR = "Element is not a <select> element"
    CONTEXT_WAS_DESTROYED_ERROR = "Execution context was destroyed"

    with open(Path(__file__).parent / "scripts/waiter.js") as f:
        WAITER_SCRIPT = f.read()
    with open(Path(__file__).parent / "scripts/waitFor.js") as f:
        WAIT_FOR_SCRIPT = (
            f"(...scriptArgs) => new Promise((resolve) => "
            f"{{ const arguments = [...scriptArgs, resolve]; {f.read()} }})"
        )

    def __init__(self, page: Page, loop):
        """
        Initialize the async Playwright driver.

        Args:
            page: Async Playwright Page instance
            loop: Event loop where the page was created (shared loop for async operations)
        """
        self._page = page
        self._loop = loop
        self._client = None  # Lazy initialization

        self.supported_tools = {
            ClickTool,
            DragAndDropTool,
            HoverTool,
            PressKeyTool,
            SelectTool,
            TypeTool,
        }

    def _run_async(self, coro):
        """
        Run an async operation and return the result synchronously.

        Args:
            coro: Coroutine to execute

        Returns:
            Result of the coroutine execution
        """
        future = asyncio.run_coroutine_threadsafe(coro, self._loop)
        return future.result()

    @property
    def client(self):
        """Lazy initialization of CDP client."""
        if self._client is None:
            self._client = self._run_async(self._init_cdp_session())
        return self._client

    async def _init_cdp_session(self):
        """Initialize Chrome DevTools Protocol session."""
        return await self._page.context.new_cdp_session(self._page)

    @property
    def platform(self) -> str:
        return "chromium"

    @property
    def accessibility_tree(self) -> ChromiumAccessibilityTree:
        self.wait_for_page_to_load()
        return self._run_async(self._get_accessibility_tree())

    async def _get_accessibility_tree(self) -> ChromiumAccessibilityTree:
        """Get accessibility tree asynchronously."""
        # Ensure client is initialized
        if self._client is None:
            self._client = await self._init_cdp_session()
        ax_tree = await self._client.send("Accessibility.getFullAXTree")
        return ChromiumAccessibilityTree(ax_tree)

    def click(self, id: int):
        self._run_async(self._click(id))

    async def _click(self, id: int):
        """Perform click operation asynchronously."""
        element = await self._find_element_async(id)
        tag_name = (await element.evaluate("el => el.tagName")).lower()

        # Llama often attempts to click options, not select them.
        if tag_name == "option":
            option = await element.text_content()
            await element.locator("xpath=.//parent::select").select_option(option)
        else:
            async with self._autoswitch_to_new_tab():
                await element.click()

    def drag_and_drop(self, from_id: int, to_id: int):
        self._run_async(self._drag_and_drop(from_id, to_id))

    async def _drag_and_drop(self, from_id: int, to_id: int):
        """Perform drag and drop operation asynchronously."""
        from_element = await self._find_element_async(from_id)
        to_element = await self._find_element_async(to_id)
        await from_element.drag_to(to_element)

    def hover(self, id: int):
        self._run_async(self._hover(id))

    async def _hover(self, id: int):
        """Perform hover operation asynchronously."""
        element = await self._find_element_async(id)
        await element.hover()

    def press_key(self, key: Key):
        self._run_async(self._press_key(key))

    async def _press_key(self, key: Key):
        """Perform key press operation asynchronously."""
        async with self._autoswitch_to_new_tab():
            await self._page.keyboard.press(key.value)

    def quit(self):
        """Cleanup page resource."""
        self._run_async(self._cleanup())

    async def _cleanup(self):
        """Cleanup page asynchronously."""
        try:
            await self._page.close()
        except Exception as e:
            logger.debug(f"Error closing page: {e}")

    def back(self):
        self._run_async(self._back())

    async def _back(self):
        """Navigate back asynchronously."""
        await self._page.go_back()

    def visit(self, url: str):
        self._run_async(self._visit(url))

    async def _visit(self, url: str):
        """Navigate to URL asynchronously."""
        await self._page.goto(url)

    @property
    def screenshot(self) -> str:
        return self._run_async(self._screenshot())

    async def _screenshot(self) -> str:
        """Take screenshot asynchronously."""
        screenshot_bytes = await self._page.screenshot()
        return b64encode(screenshot_bytes).decode()

    def scroll_to(self, id: int):
        self._run_async(self._scroll_to(id))

    async def _scroll_to(self, id: int):
        """Scroll to element asynchronously."""
        element = await self._find_element_async(id)
        await element.scroll_into_view_if_needed()

    def select(self, id: int, option: str):
        self._run_async(self._select(id, option))

    async def _select(self, id: int, option: str):
        """Perform select operation asynchronously."""
        element = await self._find_element_async(id)
        tag_name = (await element.evaluate("el => el.tagName")).lower()

        # Anthropic chooses to select using option ID, not select ID
        if tag_name == "option":
            await element.locator("xpath=.//parent::select").select_option(option)
        else:
            await element.select_option(option)

    @property
    def title(self) -> str:
        return self._run_async(self._title())

    async def _title(self) -> str:
        """Get page title asynchronously."""
        return await self._page.title()

    def type(self, id: int, text: str):
        self._run_async(self._type(id, text))

    async def _type(self, id: int, text: str):
        """Perform type operation asynchronously."""
        element = await self._find_element_async(id)
        await element.fill(text)

    @property
    def url(self) -> str:
        return self._page.url

    def find_element(self, id: int) -> Locator:
        return self._run_async(self._find_element_async(id))

    async def _find_element_async(self, id: int) -> Locator:
        """
        Find element by accessibility tree ID asynchronously.

        Args:
            id: Element ID from accessibility tree

        Returns:
            Playwright Locator for the element
        """
        accessibility_tree = await self._get_accessibility_tree()
        accessibility_element = accessibility_tree.element_by_id(id)
        backend_node_id = accessibility_element.backend_node_id

        # Ensure client is initialized (should be from _get_accessibility_tree)
        if self._client is None:
            self._client = await self._init_cdp_session()

        # Enable DOM and get flattened document
        await self._client.send("DOM.enable")
        await self._client.send("DOM.getFlattenedDocument")

        # Convert backend node ID to node ID
        node_ids = await self._client.send(
            "DOM.pushNodesByBackendIdsToFrontend",
            {
                "backendNodeIds": [backend_node_id],
            },
        )
        node_id = node_ids["nodeIds"][0]

        # Set attribute for locator
        await self._client.send(
            "DOM.setAttributeValue",
            {
                "nodeId": node_id,
                "name": "data-alumnium-id",
                "value": str(backend_node_id),
            },
        )

        # TODO: We need to remove the attribute after we are done with the element,
        # but Playwright locator is lazy and we cannot guarantee when it is safe to do so.
        return self._page.locator(f"css=[data-alumnium-id='{backend_node_id}']")

    def wait_for_page_to_load(self):
        """Wait for page to finish loading."""
        self._run_async(self._wait_for_page_to_load())

    async def _wait_for_page_to_load(self):
        """Wait for page to finish loading asynchronously."""
        logger.debug("Waiting for page to finish loading:")
        try:
            await self._page.evaluate(f"function() {{ {self.WAITER_SCRIPT} }}")
            error = await self._page.evaluate(self.WAIT_FOR_SCRIPT)
            if error is not None:
                logger.debug(f"  <- Failed to wait for page to load: {error}")
            else:
                logger.debug("  <- Page finished loading")
        except Error as error:
            if self.CONTEXT_WAS_DESTROYED_ERROR in error.message:
                logger.debug("  <- Page context has changed, retrying")
                await self._wait_for_page_to_load()
            else:
                raise error

    @asynccontextmanager
    async def _autoswitch_to_new_tab(self):
        """Automatically switch to new tab if one is opened."""
        try:
            async with self._page.context.expect_page(timeout=self.NEW_TAB_TIMEOUT) as new_page_info:
                yield
        except TimeoutError:
            return

        page = await new_page_info.value
        title = await page.title()
        logger.debug(f"Auto-switching to new tab {title} ({page.url})")
        self._page = page
        self._client = await self._page.context.new_cdp_session(page)
