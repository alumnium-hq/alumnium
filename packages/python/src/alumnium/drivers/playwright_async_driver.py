from asyncio import AbstractEventLoop, run_coroutine_threadsafe
from base64 import b64encode
from contextlib import asynccontextmanager

from playwright.async_api import Error, Locator, Page, TimeoutError

from ..accessibility import ChromiumAccessibilityTree
from ..server.logutils import get_logger
from ..tools.click_tool import ClickTool
from ..tools.drag_and_drop_tool import DragAndDropTool
from ..tools.hover_tool import HoverTool
from ..tools.press_key_tool import PressKeyTool
from ..tools.select_tool import SelectTool
from ..tools.type_tool import TypeTool
from ..tools.upload_tool import UploadTool
from .base_driver import BaseDriver
from .keys import Key
from .playwright_driver import PlaywrightDriver

logger = get_logger(__name__)


class PlaywrightAsyncDriver(BaseDriver):
    def __init__(self, page: Page, loop: AbstractEventLoop):
        self.client = None
        self.page = page
        self.loop = loop
        self.supported_tools = {
            ClickTool,
            DragAndDropTool,
            HoverTool,
            PressKeyTool,
            SelectTool,
            TypeTool,
            UploadTool,
        }

    @property
    def platform(self) -> str:
        return "chromium"

    @property
    def accessibility_tree(self) -> ChromiumAccessibilityTree:
        return self._run_async(self._accessibility_tree)

    @property
    async def _accessibility_tree(self) -> ChromiumAccessibilityTree:
        await self._wait_for_page_to_load()
        return ChromiumAccessibilityTree(await self._send_cdp_command("Accessibility.getFullAXTree"))

    def click(self, id: int):
        self._run_async(self._click(id))

    async def _click(self, id: int):
        element = await self._find_element(id)
        tag_name = (await element.evaluate("el => el.tagName")).lower()

        # Llama often attempts to click options, not select them.
        if tag_name == "option":
            option = await element.text_content()
            await element.locator("xpath=.//parent::select").select_option(option)
        else:
            async with self._autoswitch_to_new_tab():
                await element.click(force=True)

    def drag_and_drop(self, from_id: int, to_id: int):
        self._run_async(self._drag_and_drop(from_id, to_id))

    async def _drag_and_drop(self, from_id: int, to_id: int):
        from_element = await self._find_element(from_id)
        to_element = await self._find_element(to_id)
        await from_element.drag_to(to_element)

    def hover(self, id: int):
        self._run_async(self._hover(id))

    async def _hover(self, id: int):
        element = await self._find_element(id)
        await element.hover()

    def press_key(self, key: Key):
        self._run_async(self._press_key(key))

    async def _press_key(self, key: Key):
        async with self._autoswitch_to_new_tab():
            await self.page.keyboard.press(key.value)

    def quit(self):
        self._run_async(self._quit())

    async def _quit(self):
        await self.page.close()

    def back(self):
        self._run_async(self._back())

    async def _back(self):
        await self.page.go_back()

    def visit(self, url: str):
        self._run_async(self._visit(url))

    async def _visit(self, url: str):
        await self.page.goto(url)

    @property
    def screenshot(self) -> str:
        return self._run_async(self._screenshot)

    @property
    async def _screenshot(self) -> str:
        screenshot_bytes = await self.page.screenshot()
        return b64encode(screenshot_bytes).decode()

    def scroll_to(self, id: int):
        self._run_async(self._scroll_to(id))

    async def _scroll_to(self, id: int):
        element = await self._find_element(id)
        await element.scroll_into_view_if_needed()

    def select(self, id: int, option: str):
        self._run_async(self._select(id, option))

    async def _select(self, id: int, option: str):
        element = await self._find_element(id)
        tag_name = (await element.evaluate("el => el.tagName")).lower()

        # Anthropic chooses to select using option ID, not select ID
        if tag_name == "option":
            await element.locator("xpath=.//parent::select").select_option(option)
        else:
            await element.select_option(option)

    @property
    def title(self) -> str:
        return self._run_async(self._title)

    @property
    async def _title(self) -> str:
        return await self.page.title()

    def type(self, id: int, text: str):
        self._run_async(self._type(id, text))

    async def _type(self, id: int, text: str):
        element = await self._find_element(id)
        await element.fill(text)

    def upload(self, id: int, paths: list[str]):
        self._run_async(self._upload(id, paths))

    async def _upload(self, id: int, paths: list[str]):
        element = await self._find_element(id)
        async with self.page.expect_file_chooser(timeout=5000) as fc_info:
            await element.click(force=True)
        file_chooser = await fc_info.value
        await file_chooser.set_files(paths)

    @property
    def url(self) -> str:
        return self.page.url

    def find_element(self, id: int) -> Locator:
        return self._run_async(self._find_element(id))

    async def _find_element(self, id: int) -> Locator:
        accessibility_tree = await self._accessibility_tree
        accessibility_element = accessibility_tree.element_by_id(id)
        backend_node_id = accessibility_element.backend_node_id

        # Beware!
        await self._send_cdp_command("DOM.enable")
        await self._send_cdp_command("DOM.getFlattenedDocument")
        node_ids = await self._send_cdp_command(
            "DOM.pushNodesByBackendIdsToFrontend",
            {
                "backendNodeIds": [backend_node_id],
            },
        )
        node_id = node_ids["nodeIds"][0]
        await self._send_cdp_command(
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
        self._run_async(self._execute_script(script))

    async def _execute_script(self, script: str):
        await self.page.evaluate(f"() => {{ {script} }}")

    async def _wait_for_page_to_load(self):
        logger.debug("Waiting for page to finish loading:")
        try:
            await self.page.evaluate(f"function() {{ {PlaywrightDriver.WAITER_SCRIPT} }}")
            error = await self.page.evaluate(PlaywrightDriver.WAIT_FOR_SCRIPT)
            if error is not None:
                logger.debug(f"  <- Failed to wait for page to load: {error}")
            else:
                logger.debug("  <- Page finished loading")
        except Error as error:
            if PlaywrightDriver.CONTEXT_WAS_DESTROYED_ERROR in error.message:
                logger.debug("  <- Page context has changed, retrying")
                await self._wait_for_page_to_load()
            else:
                raise error

    @asynccontextmanager
    async def _autoswitch_to_new_tab(self):
        try:
            async with self.page.context.expect_page(timeout=PlaywrightDriver.NEW_TAB_TIMEOUT) as new_page_info:
                yield
        except TimeoutError:
            return

        page = await new_page_info.value
        title = await page.title()
        logger.debug(f"Auto-switching to new tab {title} ({page.url})")
        self.page = page
        self.client = await self.page.context.new_cdp_session(self.page)

    async def _send_cdp_command(self, method: str, params: dict | None = None):
        if self.client is None:
            self.client = await self.page.context.new_cdp_session(self.page)

        return await self.client.send(method, params or {})

    def _run_async(self, coro):
        future = run_coroutine_threadsafe(coro, self.loop)
        return future.result()
