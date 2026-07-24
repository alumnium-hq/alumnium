from base64 import b64encode
from contextlib import contextmanager
from os import getenv
from pathlib import Path
from urllib.parse import urlparse

from playwright.sync_api import Error, Frame, Locator, Page, TimeoutError

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
        self.page = page
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
        self.oopif_frames: set[Frame] = set()
        self._init_cdp_session()
        self._setup_page_tracking(page)

    @property
    def platform(self) -> str:
        return "chromium"

    @property
    def accessibility_tree(self) -> ChromiumAccessibilityTree:
        self._wait_for_page_to_load()

        frame_tree = self._send_cdp_command("Page.getFrameTree")
        frame_ids = self._get_all_frame_ids(frame_tree["frameTree"])
        main_frame_id = frame_tree["frameTree"]["frame"]["id"]

        frame_id_to_playwright_frame = self._build_playwright_frame_map(frame_tree)
        oopif_frame_ids = []
        for frame_id, frame in frame_id_to_playwright_frame.items():
            if frame in self.oopif_frames:
                oopif_frame_ids.append(frame_id)

        logger.debug(f"Found {len(frame_ids)} same-process frames, {len(oopif_frame_ids)} OOPIFs")

        frame_to_iframe_map = self._build_frame_owner_map(frame_tree["frameTree"], main_frame_id, oopif_frame_ids)

        all_nodes: list[dict] = []
        frame_index = 0

        for frame_id in frame_ids:
            playwright_frame = frame_id_to_playwright_frame.get(frame_id, self.page.main_frame)
            nodes = self._get_frame_nodes(frame_id)
            self._merge_frame_nodes(nodes, frame_id, frame_to_iframe_map, playwright_frame, frame_index, all_nodes)
            frame_index += 1

        for oopif_frame_id in oopif_frame_ids:
            pw_frame = frame_id_to_playwright_frame[oopif_frame_id]
            nodes = self._get_oopif_nodes(oopif_frame_id, pw_frame)
            self._merge_frame_nodes(nodes, oopif_frame_id, frame_to_iframe_map, pw_frame, frame_index, all_nodes)
            frame_index += 1

        return ChromiumAccessibilityTree({"nodes": all_nodes})

    def click(self, id: int):
        element = self.find_element(id)
        tag_name = element.evaluate("el => el.tagName")
        if tag_name.lower() == "option":
            value = element.evaluate("el => el.value")
            with self._autoswitch_to_new_tab():
                element.locator("xpath=ancestor::select").select_option(value)
        else:
            with self._autoswitch_to_new_tab():
                element.click(force=True)

    def drag_slider(self, id: int, value: float):
        element = self.find_element(id)
        element.fill(f"{value:g}")

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
        return b64encode(self.page.screenshot(full_page=self.full_page_screenshot)).decode()

    def scroll_to(self, id: int):
        element = self.find_element(id)
        element.scroll_into_view_if_needed()

    @property
    def title(self) -> str:
        return self.page.title()

    def type(self, id: int, text: str):
        element = self.find_element(id)
        element.fill(text)

    def upload(self, id: int, paths: list[str]):
        element = self.find_element(id)
        with self.page.expect_file_chooser(timeout=5000) as fc_info:
            element.click(force=True)
        file_chooser = fc_info.value
        file_chooser.set_files(paths)

    @property
    def url(self) -> str:
        return self.page.url

    @property
    def app(self) -> str:
        return urlparse(self.page.url).hostname or "unknown"

    def find_element(self, id: int) -> Locator:
        accessibility_element = self.accessibility_tree.element_by_id(id)
        frame = accessibility_element.frame or self.page.main_frame

        backend_node_id = accessibility_element.backend_node_id
        if backend_node_id is None:
            raise ValueError(f"Element {id} has no backendNodeId")

        is_oopif = frame != self.page.main_frame and frame in self.oopif_frames
        session = self.page.context.new_cdp_session(frame) if is_oopif else self.client
        try:
            # Beware!
            session.send("DOM.enable")
            session.send("DOM.getFlattenedDocument")
            node_ids = session.send(
                "DOM.pushNodesByBackendIdsToFrontend",
                {"backendNodeIds": [backend_node_id]},
            )
            node_id = node_ids["nodeIds"][0]
            session.send(
                "DOM.setAttributeValue",
                {
                    "nodeId": node_id,
                    "name": "data-alumnium-id",
                    "value": str(backend_node_id),
                },
            )
        finally:
            if is_oopif:
                session.detach()

        # TODO: We need to remove the attribute after we are done with the element,
        # but Playwright locator is lazy and we cannot guarantee when it is safe to do so.
        return frame.locator(f"css=[data-alumnium-id='{backend_node_id}']")

    def execute_script(self, script: str):
        self.page.evaluate(f"() => {{ {script} }}")

    def print_to_pdf(self, filepath: str):
        self.page.pdf(path=filepath)

    def _wait_for_page_to_load(self):
        logger.debug("Waiting for page to finish loading:")
        try:
            self.page.evaluate(self.WAITER_SCRIPT)
            error = self.page.evaluate(f"({self.WAIT_FOR_SCRIPT})()")
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
        # If auto-switch is disabled, just yield without waiting for new pages
        if not self.autoswitch_to_new_tab:
            yield
            return

        try:
            with self.page.context.expect_page(timeout=self.NEW_TAB_TIMEOUT) as new_page_info:
                yield
        except TimeoutError:
            return
        page = new_page_info.value
        logger.debug(f"Auto-switching to new tab {page.title()} ({page.url})")
        self.page = page
        self._init_cdp_session()

    def _send_cdp_command(self, method: str, params: dict | None = None):
        return self.client.send(method, params or {})

    def _init_cdp_session(self):
        self.oopif_frames.clear()
        self.client = self.page.context.new_cdp_session(self.page)
        self._enable_target_auto_attach()

    def _enable_target_auto_attach(self):
        try:
            self._send_cdp_command(
                "Target.setAutoAttach",
                {
                    "autoAttach": True,
                    "waitForDebuggerOnStart": False,
                    "flatten": True,
                },
            )
        except Exception as e:
            logger.debug(f"Could not enable Target.setAutoAttach: {e}")

    def _merge_frame_nodes(
        self,
        nodes: list[dict],
        frame_id: str,
        frame_to_iframe_map: dict[str, int],
        playwright_frame: Frame,
        frame_index: int,
        all_nodes: list[dict],
    ):
        prefix = f"f{frame_index}:"
        for node in nodes:
            if node.get("nodeId") is not None:
                node["nodeId"] = prefix + str(node["nodeId"])
            if node.get("parentId") is not None:
                node["parentId"] = prefix + str(node["parentId"])
            if node.get("childIds") is not None:
                node["childIds"] = [prefix + str(cid) for cid in node["childIds"]]
            node["_frame"] = playwright_frame
            if node.get("parentId") is None and frame_id in frame_to_iframe_map:
                node["_parent_iframe_backend_node_id"] = frame_to_iframe_map[frame_id]
            all_nodes.append(node)

    def _get_oopif_nodes(self, frame_id: str, playwright_frame: Frame) -> list[dict]:
        try:
            frame_session = self.page.context.new_cdp_session(playwright_frame)
            response = frame_session.send("Accessibility.getFullAXTree", {})
            frame_session.detach()
            nodes = response.get("nodes", [])
            logger.debug(f"  -> OOPIF {frame_id[:20]}...: {len(nodes)} nodes")
            return nodes
        except Exception as e:
            logger.debug(f"  -> OOPIF {frame_id[:20]}...: failed ({e})")
            return []

    def _build_playwright_frame_map(self, frame_tree: dict) -> dict[str, Frame]:
        frame_map: dict[str, Frame] = {}

        for frame in self.page.frames:
            cdp_frame_id = self._find_cdp_frame_id_by_url(frame_tree, frame.url)
            if cdp_frame_id:
                frame_map[cdp_frame_id] = frame

        # OOPIFs are absent from Page.getFrameTree — open a per-frame CDP session
        # and compare root frame ids.
        self.oopif_frames.clear()
        for playwright_frame in self.page.frames:
            if playwright_frame == self.page.main_frame:
                continue
            if playwright_frame in frame_map.values():
                continue
            try:
                frame_session = self.page.context.new_cdp_session(playwright_frame)
                frame_tree = frame_session.send("Page.getFrameTree")
                frame_session.detach()
                root_frame_id = frame_tree["frameTree"]["frame"]["id"]
                frame_map[root_frame_id] = playwright_frame
                self.oopif_frames.add(playwright_frame)
                logger.debug(f"Mapped OOPIF {root_frame_id[:20]}... to Playwright frame")
            except Exception as e:
                logger.debug(f"Could not detect OOPIF frame: {e}")

        return frame_map

    def _build_frame_owner_map(
        self,
        frame_info: dict,
        main_frame_id: str,
        oopif_frame_ids: list[str],
    ) -> dict[str, int]:
        frame_to_iframe_map: dict[str, int] = {}
        self._send_cdp_command("DOM.enable")

        def walk(fi: dict):
            frame_id = fi["frame"]["id"]
            if frame_id != main_frame_id:
                try:
                    owner_info = self._send_cdp_command("DOM.getFrameOwner", {"frameId": frame_id})
                    frame_to_iframe_map[frame_id] = owner_info["backendNodeId"]
                    logger.debug(
                        f"Frame {frame_id[:20]}... owned by iframe backendNodeId={owner_info['backendNodeId']}"
                    )
                except Exception as e:
                    logger.debug(f"Could not get frame owner for {frame_id[:20]}...: {e}")
            for child in fi.get("childFrames", []):
                walk(child)

        walk(frame_info)

        for oopif_frame_id in oopif_frame_ids:
            try:
                owner_info = self._send_cdp_command("DOM.getFrameOwner", {"frameId": oopif_frame_id})
                frame_to_iframe_map[oopif_frame_id] = owner_info["backendNodeId"]
                logger.debug(
                    f"OOPIF {oopif_frame_id[:20]}... owned by iframe backendNodeId={owner_info['backendNodeId']}"
                )
            except Exception as e:
                logger.debug(f"Could not get frame owner for OOPIF {oopif_frame_id[:20]}...: {e}")

        return frame_to_iframe_map

    def _get_frame_nodes(self, frame_id: str) -> list[dict]:
        try:
            response = self._send_cdp_command("Accessibility.getFullAXTree", {"frameId": frame_id})
            nodes = response.get("nodes", [])
            logger.debug(f"  -> Frame {frame_id[:20]}...: {len(nodes)} nodes")
            return nodes
        except Exception as e:
            logger.debug(f"  -> Frame {frame_id[:20]}...: failed ({e})")
            return []

    def _setup_page_tracking(self, initial_page: Page):
        self._pages: list[Page] = [initial_page]
        self._attach_page_listeners(initial_page)

    def _attach_page_listeners(self, page: Page):
        page.on("popup", self._on_popup)
        page.on("close", self._on_page_close)

    def _on_popup(self, popup: Page):
        logger.debug(f"New popup opened: {popup.url}")
        self._pages.append(popup)
        self._attach_page_listeners(popup)

    def _on_page_close(self, popup: Page):
        if popup in self._pages:
            logger.debug(f"Page closed: {popup.url}")
            self._pages.remove(popup)

    def _get_all_frame_ids(self, frame_info: dict) -> list[str]:
        frame_ids = [frame_info["frame"]["id"]]
        for child in frame_info.get("childFrames", []):
            frame_ids.extend(self._get_all_frame_ids(child))
        return frame_ids

    def _find_cdp_frame_id_by_url(self, cdp_frame_tree: dict, target_url: str) -> str | None:
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
        # Brief wait to allow popup handlers to complete
        self.page.wait_for_timeout(100)
        if len(self._pages) <= 1:
            return  # Only one tab, nothing to switch

        current_index = self._pages.index(self.page)
        self.page = self._pages[(current_index + 1) % len(self._pages)]
        self._init_cdp_session()
        self.page.wait_for_load_state()

    def switch_to_previous_tab(self):
        # Brief wait to allow popup handlers to complete
        self.page.wait_for_timeout(100)
        if len(self._pages) <= 1:
            return  # Only one tab, nothing to switch

        current_index = self._pages.index(self.page)
        self.page = self._pages[(current_index - 1) % len(self._pages)]
        self._init_cdp_session()
        self.page.wait_for_load_state()
