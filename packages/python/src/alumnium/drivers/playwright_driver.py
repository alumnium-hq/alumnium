from base64 import b64encode
from contextlib import contextmanager
from os import getenv
from pathlib import Path

from playwright.sync_api import Error, Frame, Locator, Page, TimeoutError

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
            UploadTool,
        }
        self._enable_target_auto_attach()

    @property
    def platform(self) -> str:
        return "chromium"

    @property
    def accessibility_tree(self) -> ChromiumAccessibilityTree:
        self._wait_for_page_to_load()

        # Get frame tree to enumerate all frames (same approach as Selenium)
        frame_tree = self._send_cdp_command("Page.getFrameTree")
        frame_ids = self._get_all_frame_ids(frame_tree["frameTree"])
        main_frame_id = frame_tree["frameTree"]["frame"]["id"]
        logger.debug(f"Found {len(frame_ids)} frames")

        # Get all targets including OOPIFs (cross-origin iframes)
        try:
            targets = self._send_cdp_command("Target.getTargets")
            oopif_targets = self._get_oopif_targets(targets, frame_tree)
            logger.debug(f"Found {len(oopif_targets)} cross-origin iframes")
        except Exception as e:
            logger.debug(f"Could not get OOPIF targets: {e}")
            oopif_targets = []

        # Build mapping: frameId -> backendNodeId of the iframe element containing the frame
        frame_to_iframe_map: dict[str, int] = {}
        # Build mapping: frameId -> parent frameId (for nested frames)
        frame_parent_map: dict[str, str] = {}
        self._build_frame_hierarchy(frame_tree["frameTree"], main_frame_id, frame_to_iframe_map, frame_parent_map)

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
                response = self._send_cdp_command(
                    "Accessibility.getFullAXTree",
                    {"frameId": frame_id},
                )
                nodes = response.get("nodes", [])
                logger.debug(f"  -> Frame {frame_id[:20]}...: {len(nodes)} nodes")

                # Calculate frame chain for this frame
                frame_chain = self._get_frame_chain(frame_id, frame_to_iframe_map, frame_parent_map)
                # Get Playwright frame reference
                playwright_frame = frame_id_to_playwright_frame.get(frame_id, self.page.main_frame)

                # Tag ALL nodes from child frames with their frame chain
                for node in nodes:
                    if frame_chain:
                        node["_frame_chain"] = frame_chain
                    # Also keep frame reference for Playwright-specific element finding
                    node["_frame"] = playwright_frame
                    # Tag root nodes with their parent iframe's backendNodeId (for tree inlining)
                    if node.get("parentId") is None and frame_id in frame_to_iframe_map:
                        node["_parent_iframe_backend_node_id"] = frame_to_iframe_map[frame_id]
                    all_nodes.append(node)
            except Exception as e:
                logger.debug(f"  -> Frame {frame_id[:20]}...: failed ({e})")

        # Process cross-origin iframes via Playwright query fallback
        for oopif in oopif_targets:
            try:
                nodes = self._get_cross_origin_frame_nodes(oopif)
                all_nodes.extend(nodes)
                logger.debug(f"  -> Cross-origin iframe {oopif.get('url', '')[:40]}...: {len(nodes)} nodes")
            except Exception as e:
                logger.debug(f"  -> Cross-origin iframe {oopif.get('url', '')[:40]}...: failed ({e})")

        # Process Playwright frames not in CDP tree (e.g., data: URI iframes)
        # These may not be detected by CDP or Target API but Playwright can access them
        cdp_frame_urls = set(self._get_all_frame_urls(frame_tree["frameTree"]))
        oopif_urls = {oopif.get("url", "") for oopif in oopif_targets}
        for frame in self.page.frames:
            if frame.url not in cdp_frame_urls and frame.url not in oopif_urls:
                logger.debug(f"Processing Playwright-only frame: {frame.url[:60]}")
                try:
                    # Get the backendNodeId of the iframe element (if possible)
                    iframe_backend_node_id = self._get_iframe_backend_node_id_by_url(frame.url)
                    nodes = self._query_frame_interactive_elements(frame, iframe_backend_node_id)
                    all_nodes.extend(nodes)
                    logger.debug(f"  -> Playwright-only frame {frame.url[:40]}...: {len(nodes)} nodes")
                except Exception as e:
                    logger.debug(f"  -> Playwright-only frame {frame.url[:40]}...: failed ({e})")

        return ChromiumAccessibilityTree({"nodes": all_nodes})

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

    def find_element(self, id: int) -> Locator:
        accessibility_element = self.accessibility_tree.element_by_id(id)
        frame = accessibility_element.frame or self.page.main_frame

        # Handle Playwright nodes (cross-origin iframes) using locator info
        if accessibility_element.locator_info:
            return self._find_element_by_locator_info(frame, accessibility_element.locator_info)

        # Handle CDP nodes using backendNodeId
        backend_node_id = accessibility_element.backend_node_id
        if backend_node_id is None:
            raise ValueError(f"Element {id} has no backendNodeId or locator_info")

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
        return frame.locator(f"css=[data-alumnium-id='{backend_node_id}']")

    def _find_element_by_locator_info(self, frame: Frame, locator_info: dict) -> Locator:
        """Find element using Playwright locator API for cross-origin iframe elements."""
        # Handle synthetic frame nodes
        if locator_info.get("_synthetic_frame"):
            frame_url = locator_info.get("_frame_url", "")
            logger.debug(f"Synthetic frame node clicked, returning frame locator for: {frame_url[:80]}")
            return frame.locator("body")

        # Handle selector+nth-based locators (from queried frame content)
        if "selector" in locator_info and "nth" in locator_info:
            selector = locator_info["selector"]
            nth = locator_info["nth"]
            logger.debug(f"Finding element by selector: {selector} (nth={nth})")
            return frame.locator(selector).nth(nth)

        role = locator_info.get("role")
        name = locator_info.get("name")

        logger.debug(f"Finding element by locator info: role={role}, name={name}")

        # Use Playwright's get_by_role for accessibility-based element finding
        if role and name:
            return frame.get_by_role(role, name=name)
        elif role:
            return frame.get_by_role(role)
        elif name:
            # Fallback to get_by_text if we only have name
            return frame.get_by_text(name)
        else:
            raise ValueError(f"Cannot find element: no role or name in locator_info: {locator_info}")

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

    def _find_playwright_frame_by_url(self, frame_url: str) -> Frame | None:
        """Find Playwright Frame object by URL."""
        for frame in self.page.frames:
            if frame.url == frame_url:
                return frame
        # Fallback: try to find by partial URL match for about:blank frames
        if frame_url == "about:blank":
            for frame in self.page.frames:
                if frame.url == "about:blank" or not frame.url:
                    return frame
        logger.debug(f"Could not find Playwright frame for URL: {frame_url}")
        return None

    def _enable_target_auto_attach(self):
        """Enable auto-attach to OOPIF targets for cross-origin iframe support."""
        try:
            self._send_cdp_command(
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

    def _get_all_frame_ids(self, frame_info: dict) -> list[str]:
        """Recursively collect all frame IDs from CDP frame tree."""
        frame_ids = [frame_info["frame"]["id"]]
        for child in frame_info.get("childFrames", []):
            frame_ids.extend(self._get_all_frame_ids(child))
        return frame_ids

    def _get_all_frame_urls(self, frame_info: dict) -> list[str]:
        """Recursively collect all frame URLs from CDP frame tree."""
        urls = [frame_info["frame"].get("url", "")]
        for child in frame_info.get("childFrames", []):
            urls.extend(self._get_all_frame_urls(child))
        return urls

    def _build_frame_hierarchy(
        self,
        frame_info: dict,
        main_frame_id: str,
        frame_to_iframe_map: dict[str, int],
        frame_parent_map: dict[str, str],
        parent_frame_id: str | None = None,
    ):
        """Build frame hierarchy maps recursively."""
        frame_id = frame_info["frame"]["id"]

        if frame_id != main_frame_id:
            # Get the iframe element that owns this frame
            self._send_cdp_command("DOM.enable")
            try:
                owner_info = self._send_cdp_command(
                    "DOM.getFrameOwner",
                    {"frameId": frame_id},
                )
                frame_to_iframe_map[frame_id] = owner_info["backendNodeId"]
                logger.debug(f"Frame {frame_id[:20]}... owned by iframe backendNodeId={owner_info['backendNodeId']}")
            except Exception as e:
                logger.debug(f"Could not get frame owner for {frame_id[:20]}...: {e}")

            # Track parent frame
            if parent_frame_id:
                frame_parent_map[frame_id] = parent_frame_id

        # Process children
        for child in frame_info.get("childFrames", []):
            self._build_frame_hierarchy(child, main_frame_id, frame_to_iframe_map, frame_parent_map, frame_id)

    def _get_frame_chain(
        self,
        frame_id: str,
        frame_to_iframe_map: dict[str, int],
        frame_parent_map: dict[str, str],
    ) -> list[int]:
        """Get the chain of iframe backendNodeIds from root to this frame."""
        chain: list[int] = []
        current_frame_id = frame_id

        while current_frame_id in frame_to_iframe_map:
            iframe_backend_node_id = frame_to_iframe_map[current_frame_id]
            chain.insert(0, iframe_backend_node_id)  # Insert at beginning to build from root
            # Move to parent frame
            if current_frame_id in frame_parent_map:
                current_frame_id = frame_parent_map[current_frame_id]
            else:
                break

        return chain

    def _get_oopif_targets(self, targets: dict, frame_tree: dict) -> list[dict]:
        """Identify OOPIF targets that aren't in the main frame tree."""
        frame_urls = set(self._get_all_frame_urls(frame_tree["frameTree"]))
        oopif_targets = []

        for target in targets.get("targetInfos", []):
            if target.get("type") == "iframe":
                url = target.get("url", "")
                # If this iframe URL isn't in the same-origin frame tree, it's an OOPIF
                if url and url not in frame_urls:
                    oopif_targets.append(target)
                    logger.debug(f"Detected OOPIF target: {url[:60]}")

        return oopif_targets

    def _get_cross_origin_frame_nodes(self, oopif_target: dict) -> list[dict]:
        """Get accessibility nodes from a cross-origin iframe using JavaScript query fallback."""
        url = oopif_target.get("url", "")

        # Find the Playwright frame for this URL
        frame = self._find_playwright_frame_by_url(url)
        if not frame:
            logger.debug(f"Could not find Playwright frame for URL: {url[:60]}")
            return []

        # Get the backendNodeId of the iframe element for frame chain tracking
        iframe_backend_node_id = self._get_iframe_backend_node_id_by_url(url)

        # Query interactive elements using Playwright
        nodes = self._query_frame_interactive_elements(frame, iframe_backend_node_id)
        return nodes

    def _get_iframe_backend_node_id_by_url(self, url: str) -> int | None:
        """Get the backendNodeId of an iframe element by its URL."""
        try:
            self._send_cdp_command("DOM.enable")
            doc = self._send_cdp_command("DOM.getDocument")
            result = self._send_cdp_command(
                "DOM.querySelectorAll",
                {
                    "nodeId": doc["root"]["nodeId"],
                    "selector": f"iframe[src='{url}']",
                },
            )

            if result.get("nodeIds") and len(result["nodeIds"]) > 0:
                node_id = result["nodeIds"][0]
                node = self._send_cdp_command(
                    "DOM.describeNode",
                    {"nodeId": node_id},
                )
                return node.get("node", {}).get("backendNodeId")
        except Exception as e:
            logger.debug(f"Could not get iframe backendNodeId: {e}")
        return None

    def _query_frame_interactive_elements(self, frame: Frame, iframe_backend_node_id: int | None) -> list[dict]:
        """Query interactive elements in a frame using Playwright."""
        nodes = []
        node_id = -1

        try:
            # Query for interactive elements inside the frame using Playwright
            interactive_selectors = [
                ("button", "button"),
                ("a", "link"),
                ("[role='button']", "button"),
                ("[role='link']", "link"),
                ("input[type='submit']", "button"),
                ("input:not([type='hidden'])", "textbox"),
                ("select", "combobox"),
                ("textarea", "textbox"),
                ("[aria-label]", "generic"),
            ]

            for selector, role in interactive_selectors:
                try:
                    elements = frame.locator(selector)
                    count = elements.count()
                    for i in range(min(count, 20)):
                        element = elements.nth(i)
                        try:
                            text = element.text_content(timeout=1000)
                            aria_label = element.get_attribute("aria-label", timeout=1000)
                            name = aria_label or (text.strip()[:50] if text else "")

                            if name:
                                synthetic_node = {
                                    "nodeId": str(node_id),
                                    "role": {"value": role},
                                    "name": {"value": name},
                                    "_playwright_node": True,
                                    "_locator_info": {"selector": selector, "nth": i},
                                }

                                # Track which iframe this is in
                                if iframe_backend_node_id:
                                    synthetic_node["_frame_chain"] = [iframe_backend_node_id]

                                # Store frame reference for element finding
                                synthetic_node["_frame"] = frame

                                nodes.append(synthetic_node)
                                node_id -= 1
                                logger.debug(f"  -> Found {role}: {name[:40]}")
                        except Exception:
                            pass
                except Exception:
                    pass

            logger.debug(f"  -> Created {len(nodes)} synthetic nodes for cross-origin frame")
        except Exception as e:
            logger.error(f"  -> Failed to query frame content: {e}")

        return nodes

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
