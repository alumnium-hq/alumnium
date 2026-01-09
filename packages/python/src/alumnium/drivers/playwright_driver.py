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

    @property
    def platform(self) -> str:
        return "chromium"

    @property
    def accessibility_tree(self) -> ChromiumAccessibilityTree:
        self._wait_for_page_to_load()

        # Use Playwright's native frame detection (operates at DOM/JavaScript level)
        # This should detect cross-origin iframes that CDP's frame tree might miss
        playwright_frames = list(self.page.frames)
        logger.debug(f"Playwright detected {len(playwright_frames)} frames")

        # Get CDP frame tree for mapping frameIds
        cdp_frame_tree = self._send_cdp_command("Page.getFrameTree")

        # Build combined accessibility tree from all frames
        all_nodes: list[dict] = []

        for frame in playwright_frames:
            frame_url = frame.url
            logger.debug(f"Processing frame: {frame_url}")

            # Get accessibility tree for this frame
            try:
                tree_response = self._get_accessibility_tree_for_frame(frame, cdp_frame_tree)
                node_count = len(tree_response.get("nodes", []))
                logger.debug(f"  -> Got {node_count} nodes")

                # Tag all nodes with their Playwright frame reference
                for node in tree_response.get("nodes", []):
                    node["_frame"] = frame
                    all_nodes.append(node)
            except Exception as e:
                logger.error(f"  -> Failed to get accessibility tree: {e}")

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

    def _get_accessibility_tree_for_frame(self, frame: Frame, cdp_frame_tree: dict) -> dict:
        """Get accessibility tree for a Playwright frame.

        Bridges Playwright Frame → CDP accessibility tree by finding the CDP frameId.
        """
        # Find matching CDP frame by URL
        cdp_frame_id = self._find_cdp_frame_id_by_url(cdp_frame_tree, frame.url)

        if cdp_frame_id:
            # Use CDP to get accessibility tree with frameId
            return self._send_cdp_command(
                "Accessibility.getFullAXTree",
                {"frameId": cdp_frame_id}
            )
        else:
            # Frame not visible to CDP - query frame content directly using Playwright
            logger.info(f"Frame {frame.url} not in CDP tree, querying interactive elements")

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
                                    nodes.append(synthetic_node)
                                    node_id -= 1
                                    logger.debug(f"  -> Found {role}: {name[:40]}")
                            except Exception:
                                pass
                    except Exception:
                        pass

                logger.debug(f"  -> Created {len(nodes)} synthetic nodes for {frame.url[:60]}")
            except Exception as e:
                logger.error(f"  -> Failed to query frame content: {e}")

            # Always add a frame container node
            frame_node = {
                "nodeId": str(node_id),
                "role": {"value": "Iframe"},
                "name": {"value": f"Cross-origin iframe: {frame.url[:80]}"},
                "_playwright_node": True,
                "_frame_url": frame.url,
                "childIds": [str(i) for i in range(-1, node_id, -1)] if nodes else [],
            }
            nodes.append(frame_node)

            return {"nodes": nodes}

    def _convert_playwright_snapshot_to_cdp_nodes(self, snapshot: dict) -> list[dict]:
        """Convert Playwright accessibility snapshot to CDP node format.

        Playwright snapshot is a tree structure, CDP expects a flat list of nodes.
        For nodes from Playwright snapshot, we use negative nodeIds to distinguish them
        from CDP nodes, and store locator info for finding elements.
        """
        nodes = []
        node_id_counter = [-1]  # Use negative IDs for Playwright nodes

        def process_node(pw_node: dict, parent_id: int | None = None) -> int:
            # Generate unique node ID (negative to distinguish from CDP nodes)
            current_id = node_id_counter[0]
            node_id_counter[0] -= 1

            # Build CDP-compatible node
            cdp_node = {
                "nodeId": str(current_id),
                "role": {"value": pw_node.get("role", "generic")},
                "_playwright_node": True,  # Mark as Playwright node
            }

            # Build locator strategy for this node
            role = pw_node.get("role", "generic")
            name = pw_node.get("name")

            # Store locator info - we'll use this in find_element
            locator_info = {"role": role}
            if name:
                locator_info["name"] = name
                cdp_node["name"] = {"value": name}

            cdp_node["_locator_info"] = locator_info

            # Add value if present
            if "value" in pw_node:
                cdp_node["value"] = {"value": str(pw_node["value"])}

            # Add description if present
            if "description" in pw_node and pw_node["description"]:
                cdp_node["description"] = {"value": pw_node["description"]}

            # Add checked state if present
            if "checked" in pw_node:
                cdp_node["checked"] = {"value": pw_node["checked"]}

            # Add disabled state if present
            if "disabled" in pw_node:
                cdp_node["disabled"] = {"value": pw_node["disabled"]}

            # Link to parent
            if parent_id is not None:
                cdp_node["parentId"] = str(parent_id)

            # Collect child IDs
            child_ids = []
            if "children" in pw_node:
                for child in pw_node["children"]:
                    child_id = process_node(child, current_id)
                    child_ids.append(str(child_id))

            if child_ids:
                cdp_node["childIds"] = child_ids

            nodes.append(cdp_node)
            return current_id

        # Process root node
        process_node(snapshot)
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
