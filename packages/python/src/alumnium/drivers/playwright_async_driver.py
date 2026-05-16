from asyncio import AbstractEventLoop, run_coroutine_threadsafe
from base64 import b64encode
from contextlib import asynccontextmanager
from urllib.parse import urlparse

from playwright.async_api import Error, Frame, Locator, Page, TimeoutError

from .. import FULL_PAGE_SCREENSHOT
from ..accessibility import ChromiumAccessibilityTree
from ..logutils import get_logger
from ..tools.click_tool import ClickTool
from ..tools.drag_and_drop_tool import DragAndDropTool
from ..tools.hover_tool import HoverTool
from ..tools.press_key_tool import PressKeyTool
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
        self.autoswitch_to_new_tab = True
        self.full_page_screenshot = FULL_PAGE_SCREENSHOT
        self.supported_tools = {
            ClickTool,
            DragAndDropTool,
            HoverTool,
            PressKeyTool,
            TypeTool,
            UploadTool,
        }
        self._run_async(self._enable_target_auto_attach())
        self._run_async(self._setup_page_tracking(page))

    @property
    def platform(self) -> str:
        return "chromium"

    @property
    def accessibility_tree(self) -> ChromiumAccessibilityTree:
        return self._run_async(self._accessibility_tree)

    @property
    async def _accessibility_tree(self) -> ChromiumAccessibilityTree:
        await self._wait_for_page_to_load()

        # Get frame tree to enumerate all frames (same approach as Selenium)
        frame_tree = await self._send_cdp_command("Page.getFrameTree")
        frame_ids = self._get_all_frame_ids(frame_tree["frameTree"])
        main_frame_id = frame_tree["frameTree"]["frame"]["id"]
        logger.debug(f"Found {len(frame_ids)} frames")

        # Build mapping: frameId -> backendNodeId of the iframe element containing the frame
        frame_to_iframe_map: dict[str, int] = {}
        await self._build_frame_hierarchy(
            frame_tree["frameTree"], main_frame_id, frame_to_iframe_map
        )

        # Build mapping: frameId -> Playwright Frame object (for element finding)
        frame_id_to_playwright_frame: dict[str, Frame] = {}
        for frame in self.page.frames:
            cdp_frame_id = self._find_cdp_frame_id_by_url(frame_tree, frame.url)
            if cdp_frame_id:
                frame_id_to_playwright_frame[cdp_frame_id] = frame

        # Aggregate accessibility nodes from all frames
        all_nodes: list[dict] = []
        for frame_id in frame_ids:
            try:
                response = await self._send_cdp_command(
                    "Accessibility.getFullAXTree",
                    {"frameId": frame_id},
                )
                nodes = response.get("nodes", [])
                logger.debug(f"  -> Frame {frame_id[:20]}...: {len(nodes)} nodes")

                # Get Playwright frame reference
                playwright_frame = frame_id_to_playwright_frame.get(frame_id, self.page.main_frame)

                for node in nodes:
                    node["_frame"] = playwright_frame
                    # Tag root nodes with their parent iframe's backendNodeId (for tree inlining)
                    if node.get("parentId") is None and frame_id in frame_to_iframe_map:
                        node["_parent_iframe_backend_node_id"] = frame_to_iframe_map[frame_id]
                    all_nodes.append(node)
            except Exception as e:
                logger.debug(f"  -> Frame {frame_id[:20]}...: failed ({e})")

        return ChromiumAccessibilityTree({"nodes": all_nodes})

    def click(self, id: int):
        self._run_async(self._click(id))

    async def _click(self, id: int):
        element = await self._find_element(id)
        tag_name = await element.evaluate("el => el.tagName")
        if tag_name.lower() == "option":
            value = await element.evaluate("el => el.value")
            async with self._autoswitch_to_new_tab():
                await element.locator("xpath=parent::select").select_option(value)
        else:
            async with self._autoswitch_to_new_tab():
                await element.click(force=True)

    def drag_slider(self, id: int, value: float):
        self._run_async(self._drag_slider(id, value))

    async def _drag_slider(self, id: int, value: float):
        element = await self._find_element(id)
        await element.fill(f"{value:g}")

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
        screenshot_bytes = await self.page.screenshot(full_page=self.full_page_screenshot)
        return b64encode(screenshot_bytes).decode()

    def scroll_to(self, id: int):
        self._run_async(self._scroll_to(id))

    async def _scroll_to(self, id: int):
        element = await self._find_element(id)
        await element.scroll_into_view_if_needed()

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

    @property
    def app(self) -> str:
        return urlparse(self.page.url).hostname or "unknown"

    def find_element(self, id: int) -> Locator:
        return self._run_async(self._find_element(id))

    async def _find_element(self, id: int) -> Locator:
        accessibility_tree = await self._accessibility_tree
        accessibility_element = accessibility_tree.element_by_id(id)
        frame = accessibility_element.frame or self.page.main_frame

        backend_node_id = accessibility_element.backend_node_id
        if backend_node_id is None:
            raise ValueError(f"Element {id} has no backendNodeId")

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
        return frame.locator(f"css=[data-alumnium-id='{backend_node_id}']")

    def execute_script(self, script: str):
        self._run_async(self._execute_script(script))

    async def _execute_script(self, script: str):
        await self.page.evaluate(f"() => {{ {script} }}")

    def print_to_pdf(self, filepath: str):
        self._run_async(self._print_to_pdf(filepath))

    async def _print_to_pdf(self, filepath: str):
        await self.page.pdf(path=filepath)

    async def _wait_for_page_to_load(self):
        logger.debug("Waiting for page to finish loading:")
        try:
            await self.page.evaluate(PlaywrightDriver.WAITER_SCRIPT)
            error = await self.page.evaluate(f"({PlaywrightDriver.WAIT_FOR_SCRIPT})()")
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
        # If auto-switch is disabled, just yield without waiting for new pages
        if not self.autoswitch_to_new_tab:
            yield
            return

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

    async def _enable_target_auto_attach(self):
        """Enable auto-attach to OOPIF targets for cross-origin iframe support."""
        try:
            await self._send_cdp_command(
                "Target.setAutoAttach",
                {
                    "autoAttach": True,
                    "waitForDebuggerOnStart": False,
                    "flatten": True,
                },
            )
            logger.debug("Enabled Target.setAutoAttach for OOPIF support")
        except Exception as e:
            logger.debug(f"Could not enable Target.setAutoAttach: {e}")

    async def _setup_page_tracking(self, initial_page: Page):
        """Set up tracking for all pages in the context."""
        self._pages: list[Page] = [initial_page]
        self._attach_page_listeners(initial_page)

    def _attach_page_listeners(self, page: Page):
        """Attach popup and close listeners to a page."""
        # Use sync handler to avoid deadlock - async handler would block via _run_async
        page.on("popup", self._on_popup_sync)
        page.on("close", self._on_page_close)

    def _on_popup_sync(self, popup: Page):
        """Handle new popup/tab opened from a page (sync to avoid deadlock)."""
        logger.debug(f"New popup opened: {popup.url}")
        self._pages.append(popup)
        self._attach_page_listeners(popup)  # Chain: new page also listens for popups

    def _on_page_close(self, popup: Page):
        """Handle page closed."""
        if popup in self._pages:
            logger.debug(f"Page closed: {popup.url}")
            self._pages.remove(popup)

    def _get_all_frame_ids(self, frame_info: dict) -> list[str]:
        """Recursively collect all frame IDs from CDP frame tree."""
        frame_ids = [frame_info["frame"]["id"]]
        for child in frame_info.get("childFrames", []):
            frame_ids.extend(self._get_all_frame_ids(child))
        return frame_ids

    async def _build_frame_hierarchy(
        self,
        frame_info: dict,
        main_frame_id: str,
        frame_to_iframe_map: dict[str, int],
    ):
        """Build frame hierarchy maps recursively."""
        frame_id = frame_info["frame"]["id"]

        if frame_id != main_frame_id:
            # Get the iframe element that owns this frame
            await self._send_cdp_command("DOM.enable")
            try:
                owner_info = await self._send_cdp_command(
                    "DOM.getFrameOwner",
                    {"frameId": frame_id},
                )
                frame_to_iframe_map[frame_id] = owner_info["backendNodeId"]
                logger.debug(f"Frame {frame_id[:20]}... owned by iframe backendNodeId={owner_info['backendNodeId']}")
            except Exception as e:
                logger.debug(f"Could not get frame owner for {frame_id[:20]}...: {e}")

        # Process children
        for child in frame_info.get("childFrames", []):
            await self._build_frame_hierarchy(child, main_frame_id, frame_to_iframe_map)

    def _find_cdp_frame_id_by_url(self, cdp_frame_tree: dict, target_url: str) -> str | None:
        """Find CDP frameId by matching URL in CDP frame tree."""

        def search_frame(frame_info: dict) -> str | None:
            frame = frame_info["frame"]
            if frame["url"] == target_url:
                return frame["id"]

            for child in frame_info.get("childFrames", []):
                result = search_frame(child)
                if result:
                    return result
            return None

        return search_frame(cdp_frame_tree["frameTree"])

    def switch_to_next_tab(self):
        self._run_async(self._switch_to_next_tab())

    async def _switch_to_next_tab(self):
        # Brief wait to allow popup handlers to complete
        await self.page.wait_for_timeout(100)
        if len(self._pages) <= 1:
            return  # Only one tab, nothing to switch

        current_index = self._pages.index(self.page)
        next_index = (current_index + 1) % len(self._pages)  # Wrap to first

        self.page = self._pages[next_index]
        self.client = None  # Reset CDP client for new page
        await self.page.wait_for_load_state()
        logger.debug(f"Switched to next tab: {self.page.url}")

    def switch_to_previous_tab(self):
        self._run_async(self._switch_to_previous_tab())

    async def _switch_to_previous_tab(self):
        # Brief wait to allow popup handlers to complete
        await self.page.wait_for_timeout(100)
        if len(self._pages) <= 1:
            return  # Only one tab, nothing to switch

        current_index = self._pages.index(self.page)
        prev_index = (current_index - 1) % len(self._pages)  # Wrap to last

        self.page = self._pages[prev_index]
        self.client = None  # Reset CDP client for new page
        await self.page.wait_for_load_state()
        logger.debug(f"Switched to previous tab: {self.page.url}")

    def _run_async(self, coro):
        future = run_coroutine_threadsafe(coro, self.loop)
        return future.result()
