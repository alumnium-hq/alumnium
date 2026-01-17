from pathlib import Path
from typing import Callable

from retry import retry
from selenium.webdriver.chrome.remote_connection import ChromiumRemoteConnection
from selenium.webdriver.common.action_chains import ActionChains
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.remote.errorhandler import JavascriptException
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement
from selenium.webdriver.support.select import Select

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


class SeleniumDriver(BaseDriver):
    with open(Path(__file__).parent / "scripts/waiter.js") as f:
        WAITER_SCRIPT = f.read()
    with open(Path(__file__).parent / "scripts/waitFor.js") as f:
        WAIT_FOR_SCRIPT = f.read()

    def __init__(self, driver: WebDriver):
        self.driver = driver
        self.supported_tools = {
            ClickTool,
            DragAndDropTool,
            HoverTool,
            PressKeyTool,
            SelectTool,
            TypeTool,
            UploadTool,
        }
        self._patch_driver(driver)
        self._enable_target_auto_attach()

    @property
    def platform(self) -> str:
        return "chromium"

    @property
    def accessibility_tree(self) -> ChromiumAccessibilityTree:
        # Switch to default content to ensure we're at the top level for frame enumeration
        self.driver.switch_to.default_content()
        self._wait_for_page_to_load()

        # Get frame tree to enumerate all frames
        frame_tree = self.driver.execute_cdp_cmd("Page.getFrameTree", {})  # type: ignore[attr-defined]
        frame_ids = self._get_all_frame_ids(frame_tree["frameTree"])
        main_frame_id = frame_tree["frameTree"]["frame"]["id"]
        logger.debug(f"Found {len(frame_ids)} frames")

        # Get all targets including OOPIFs (cross-origin iframes)
        try:
            targets = self.driver.execute_cdp_cmd("Target.getTargets", {})  # type: ignore[attr-defined]
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

        # Aggregate accessibility nodes from all frames
        all_nodes = []
        for frame_id in frame_ids:
            try:
                response = self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
                    "Accessibility.getFullAXTree",
                    {"frameId": frame_id},
                )
                nodes = response.get("nodes", [])
                logger.debug(f"  -> Frame {frame_id[:20]}...: {len(nodes)} nodes")
                # Tag ALL nodes from child frames with their frame chain (list of iframe backendNodeIds)
                # This allows us to switch through nested frames when finding elements
                frame_chain = self._get_frame_chain(frame_id, frame_to_iframe_map, frame_parent_map)
                for node in nodes:
                    if frame_chain:
                        node["_frame_chain"] = frame_chain
                all_nodes.extend(nodes)
            except Exception as e:
                logger.debug(f"  -> Frame {frame_id[:20]}...: failed ({e})")

        # Process cross-origin iframes via JavaScript fallback
        for oopif in oopif_targets:
            try:
                nodes = self._get_cross_origin_frame_nodes(oopif)
                all_nodes.extend(nodes)
                logger.debug(f"  -> Cross-origin iframe {oopif.get('url', '')[:40]}...: {len(nodes)} nodes")
            except Exception as e:
                logger.debug(f"  -> Cross-origin iframe {oopif.get('url', '')[:40]}...: failed ({e})")

        return ChromiumAccessibilityTree({"nodes": all_nodes})

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
            self.driver.execute_cdp_cmd("DOM.enable", {})  # type: ignore[attr-defined]
            try:
                owner_info = self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
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

    def _get_all_frame_ids(self, frame_info: dict) -> list:
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

        # Find the iframe element that contains this URL
        iframe_element = self._find_iframe_by_url(url)
        if not iframe_element:
            logger.debug(f"Could not find iframe element for URL: {url[:60]}")
            return []

        # Get the backendNodeId of the iframe element for frame chain tracking
        iframe_backend_node_id = self._get_element_backend_node_id(iframe_element)

        # Switch into the cross-origin iframe
        self.driver.switch_to.frame(iframe_element)

        try:
            # Query interactive elements using JavaScript
            nodes = self._query_frame_interactive_elements(iframe_backend_node_id)
            return nodes
        finally:
            # Always switch back to default content
            self.driver.switch_to.default_content()

    def _find_iframe_by_url(self, url: str) -> WebElement | None:
        """Find an iframe element by its src URL."""
        try:
            iframes = self.driver.find_elements(By.TAG_NAME, "iframe")
            for iframe in iframes:
                src = iframe.get_attribute("src")
                if src == url:
                    return iframe
            return None
        except Exception:
            return None

    def _get_element_backend_node_id(self, element: WebElement) -> int | None:
        """Get the backendNodeId for a WebElement using CDP."""
        try:
            # Set temporary attribute to identify element
            unique_id = f"alumnium-temp-{id(element)}"
            self.driver.execute_script(
                "arguments[0].setAttribute('data-alumnium-temp', arguments[1])",
                element,
                unique_id,
            )

            # Use CDP to find the node
            self.driver.execute_cdp_cmd("DOM.enable", {})  # type: ignore[attr-defined]
            doc = self.driver.execute_cdp_cmd("DOM.getDocument", {})  # type: ignore[attr-defined]
            result = self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
                "DOM.querySelector",
                {
                    "nodeId": doc["root"]["nodeId"],
                    "selector": f"[data-alumnium-temp='{unique_id}']",
                },
            )

            if result.get("nodeId"):
                node = self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
                    "DOM.describeNode",
                    {"nodeId": result["nodeId"]},
                )
                backend_node_id = node.get("node", {}).get("backendNodeId")

                # Clean up
                self.driver.execute_script("arguments[0].removeAttribute('data-alumnium-temp')", element)

                return backend_node_id
        except Exception as e:
            logger.debug(f"Could not get backendNodeId: {e}")
        return None

    def _query_frame_interactive_elements(self, iframe_backend_node_id: int | None) -> list[dict]:
        """Query interactive elements in the current frame using JavaScript."""
        # JavaScript to find interactive elements
        js_query = """
        return Array.from(document.querySelectorAll(
            'button, a, [role="button"], [role="link"], input[type="submit"], ' +
            '[aria-label], input:not([type="hidden"]), select, textarea'
        )).slice(0, 100).map((el, index) => {
            const rect = el.getBoundingClientRect();
            return {
                tagName: el.tagName.toLowerCase(),
                role: el.getAttribute('role') || el.tagName.toLowerCase(),
                name: el.getAttribute('aria-label') || el.textContent?.trim()?.slice(0, 100) || '',
                type: el.getAttribute('type') || '',
                id: el.id,
                className: el.className,
                index: index,
                visible: rect.width > 0 && rect.height > 0
            };
        }).filter(el => el.visible && el.name);
        """

        elements = self.driver.execute_script(js_query)
        nodes = []
        node_id = -1  # Use negative IDs for synthetic nodes

        for el in elements:
            role = self._map_tag_to_role(el.get("tagName", ""), el.get("role", ""))
            selector = self._build_element_selector(el)

            synthetic_node = {
                "nodeId": str(node_id),
                "role": {"value": role},
                "name": {"value": el.get("name", "")},
                "_playwright_node": True,  # Mark as synthetic (reuse existing flag)
                "_locator_info": {
                    "selector": selector,
                    "nth": el.get("index", 0),
                },
            }

            # Track which iframe this is in
            if iframe_backend_node_id:
                synthetic_node["_frame_chain"] = [iframe_backend_node_id]

            nodes.append(synthetic_node)
            node_id -= 1

        return nodes

    def _map_tag_to_role(self, tag: str, role: str) -> str:
        """Map HTML tag/role to accessibility role."""
        if role and role not in ("", tag):
            return role
        tag_role_map = {
            "a": "link",
            "button": "button",
            "input": "textbox",
            "select": "combobox",
            "textarea": "textbox",
        }
        return tag_role_map.get(tag, tag)

    def _build_element_selector(self, el: dict) -> str:
        """Build a CSS selector for an element."""
        tag = el.get("tagName", "")
        el_id = el.get("id", "")
        el_type = el.get("type", "")

        if el_id:
            return f"#{el_id}"
        if tag == "input" and el_type:
            return f"input[type='{el_type}']"
        return tag

    @staticmethod
    def _autoswitch_to_new_tab(func: Callable) -> Callable:  # type: ignore[reportSelfClsParameterName]
        """Decorator that automatically switches to new tabs opened during method execution."""

        def wrapper(self: "SeleniumDriver", *args, **kwargs):
            current_handles = self.driver.window_handles
            result = func(self, *args, **kwargs)
            new_handles = self.driver.window_handles
            new_tabs = set(new_handles) - set(current_handles)
            if new_tabs:
                # Only switch to the last new tab opened, as only one tab can be active at a time.
                # This is intentional and avoids unnecessary context switches.
                last_handle = list(new_tabs)[-1]
                if last_handle != self.driver.current_window_handle:
                    self.driver.switch_to.window(last_handle)
                    logger.debug(f"Auto-switching to new tab: {self.driver.title} ({self.driver.current_url})")
            return result

        return wrapper

    @_autoswitch_to_new_tab
    def click(self, id: int):
        self.find_element(id).click()

    def drag_and_drop(self, from_id: int, to_id: int):
        actions = ActionChains(self.driver)
        actions.drag_and_drop(
            self.find_element(from_id),
            self.find_element(to_id),
        ).perform()

    def hover(self, id: int):
        actions = ActionChains(self.driver)
        actions.move_to_element(self.find_element(id)).perform()

    @_autoswitch_to_new_tab
    def press_key(self, key: Key):
        keys = []
        if key == Key.BACKSPACE:
            keys.append(Keys.BACKSPACE)
        elif key == Key.ENTER:
            keys.append(Keys.ENTER)
        elif key == Key.ESCAPE:
            keys.append(Keys.ESCAPE)
        elif key == Key.TAB:
            keys.append(Keys.TAB)

        ActionChains(self.driver).send_keys(*keys).perform()

    def quit(self):
        self.driver.quit()

    def back(self):
        self.driver.back()

    def visit(self, url: str):
        self.driver.get(url)

    @property
    def screenshot(self) -> str:
        return self.driver.get_screenshot_as_base64()

    def scroll_to(self, id: int):
        element = self.find_element(id)
        self.driver.execute_script("arguments[0].scrollIntoView();", element)

    def select(self, id: int, option: str):
        element = self.find_element(id)
        # Anthropic chooses to select using option ID, not select ID
        if element.tag_name == "option":
            element = element.find_element(By.XPATH, ".//parent::select")
        Select(element).select_by_visible_text(option)

    @property
    def title(self) -> str:
        return self.driver.title

    def type(self, id: int, text: str):
        element = self.find_element(id)
        element.clear()
        element.send_keys(text)

    def upload(self, id: int, paths: list[str]):
        element = self.find_element(id)
        element.send_keys("\n".join(paths))

    @property
    def url(self) -> str:
        return self.driver.current_url

    def find_element(self, id: int) -> WebElement:
        accessibility_element = self.accessibility_tree.element_by_id(id)

        # Handle synthetic nodes (cross-origin iframe elements)
        if accessibility_element.locator_info:
            return self._find_element_by_locator_info(accessibility_element)

        backend_node_id = accessibility_element.backend_node_id
        frame_chain = accessibility_element.frame_chain

        # Switch through the frame chain if element is inside nested iframes
        if frame_chain:
            self._switch_to_frame_chain(frame_chain)

        # Beware!
        self.driver.execute_cdp_cmd("DOM.enable", {})  # type: ignore[attr-defined]
        self.driver.execute_cdp_cmd("DOM.getFlattenedDocument", {})  # type: ignore[attr-defined]
        node_ids = self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
            "DOM.pushNodesByBackendIdsToFrontend", {"backendNodeIds": [backend_node_id]}
        )
        node_id = node_ids["nodeIds"][0]
        self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
            "DOM.setAttributeValue",
            {
                "nodeId": node_id,
                "name": "data-alumnium-id",
                "value": str(backend_node_id),
            },
        )
        element = self.driver.find_element(By.CSS_SELECTOR, f"[data-alumnium-id='{backend_node_id}']")
        self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
            "DOM.removeAttribute",
            {
                "nodeId": node_id,
                "name": "data-alumnium-id",
            },
        )

        # Note: We don't switch back to default content here because the element
        # needs to remain in its frame context for subsequent operations (click, type, etc.)

        return element

    def _find_element_by_locator_info(self, accessibility_element) -> WebElement:
        """Find element using locator info for cross-origin iframe elements."""
        locator_info = accessibility_element.locator_info
        frame_chain = accessibility_element.frame_chain

        # Switch to the appropriate frame
        if frame_chain:
            self._switch_to_frame_chain(frame_chain)

        selector = locator_info.get("selector", "")
        nth = locator_info.get("nth", 0)

        elements = self.driver.find_elements(By.CSS_SELECTOR, selector)
        if nth < len(elements):
            return elements[nth]

        raise ValueError(f"Could not find element with selector {selector} (nth={nth})")

    def _switch_to_frame_chain(self, frame_chain: list[int]):
        """Switch through a chain of nested iframes."""
        # First switch to default content to ensure we're at the top level
        self.driver.switch_to.default_content()

        # Switch through each iframe in the chain
        for iframe_backend_node_id in frame_chain:
            self._switch_to_single_frame(iframe_backend_node_id)

    def _switch_to_single_frame(self, iframe_backend_node_id: int):
        """Switch to a single frame identified by the iframe element's backendNodeId."""
        # Use CDP to find and switch to the iframe
        self.driver.execute_cdp_cmd("DOM.enable", {})  # type: ignore[attr-defined]
        self.driver.execute_cdp_cmd("DOM.getFlattenedDocument", {})  # type: ignore[attr-defined]
        node_ids = self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
            "DOM.pushNodesByBackendIdsToFrontend", {"backendNodeIds": [iframe_backend_node_id]}
        )
        node_id = node_ids["nodeIds"][0]
        self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
            "DOM.setAttributeValue",
            {
                "nodeId": node_id,
                "name": "data-alumnium-iframe-id",
                "value": str(iframe_backend_node_id),
            },
        )
        iframe_element = self.driver.find_element(
            By.CSS_SELECTOR, f"[data-alumnium-iframe-id='{iframe_backend_node_id}']"
        )
        self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
            "DOM.removeAttribute",
            {
                "nodeId": node_id,
                "name": "data-alumnium-iframe-id",
            },
        )
        self.driver.switch_to.frame(iframe_element)
        logger.debug(f"Switched to iframe with backendNodeId={iframe_backend_node_id}")

    def execute_script(self, script: str):
        self.driver.execute_script(script)

    # Remote Chromium instances support CDP commands, but the Python bindings don't expose them.
    # https://github.com/SeleniumHQ/selenium/issues/14799
    def _patch_driver(self, driver: WebDriver):
        if isinstance(driver.command_executor, ChromiumRemoteConnection) and not hasattr(driver, "execute_cdp_cmd"):
            # Copied from https://github.com/SeleniumHQ/selenium/blob/d6e718d134987d62cd8ffff476821fb3ca1797c2/py/selenium/webdriver/chromium/webdriver.py#L123-L141 # noqa: E501
            def execute_cdp_cmd(self, cmd: str, cmd_args: dict):
                return self.execute("executeCdpCommand", {"cmd": cmd, "params": cmd_args})["value"]

            driver.execute_cdp_cmd = execute_cdp_cmd.__get__(driver)  # type: ignore[attr-defined]

    def _enable_target_auto_attach(self):
        """Enable auto-attach to OOPIF targets for cross-origin iframe support."""
        try:
            self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
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

    @retry(JavascriptException, tries=2, delay=0.1, backoff=2)  # type: ignore[reportArgumentType]
    def _wait_for_page_to_load(self):
        logger.debug("Waiting for page to finish loading:")
        self.driver.execute_script(self.WAITER_SCRIPT)
        error = self.driver.execute_async_script(self.WAIT_FOR_SCRIPT)
        if error is not None:
            logger.debug(f"  <- Failed to wait for page to load: {error}")
        else:
            logger.debug("  <- Page finished loading")
