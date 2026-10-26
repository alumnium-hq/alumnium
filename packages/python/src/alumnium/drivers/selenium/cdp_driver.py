from base64 import b64decode

from selenium.webdriver.chrome.remote_connection import ChromiumRemoteConnection
from selenium.webdriver.common.by import By
from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement

from ...accessibility import ChromiumAccessibilityTree
from ...logutils import get_logger
from ..selenium_driver import SeleniumDriver
from ..waiter import WAITER_SCRIPT
from .cdp_connection import CdpConnection

logger = get_logger(__name__)


class CdpDriver(SeleniumDriver):
    """Selenium driver for Chromium browsers, which builds accessibility trees over CDP."""

    def __init__(self, driver: WebDriver):
        self._shadow_child_to_host_map: dict[int, int] = {}
        self.cdp_connection: CdpConnection | None = None
        self._patch_driver(driver)
        super().__init__(driver)

    @property
    def platform(self) -> str:
        return "chromium"

    def _init_page_scripts(self):
        self._enable_target_auto_attach()
        try:
            self.cdp_connection = CdpConnection(self.driver.capabilities, WAITER_SCRIPT)
        except Exception as error:
            logger.debug(f"Could not connect to CDP to inject the waiter script: {error}")
            self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
                "Page.addScriptToEvaluateOnNewDocument",
                {"source": WAITER_SCRIPT, "runImmediately": True},
            )

    def _close_connections(self):
        if self.cdp_connection:
            self.cdp_connection.close()

    def _fetch_accessibility_tree(self) -> ChromiumAccessibilityTree:
        # Switch to default content to ensure we're at the top level for frame enumeration
        self.driver.switch_to.default_content()

        # A new tab might take the foreground and leave the current one hidden.
        self.driver.switch_to.window(self.driver.current_window_handle)

        self._wait_for_page_to_load()

        # Get frame tree to enumerate all frames
        frame_tree = self.driver.execute_cdp_cmd("Page.getFrameTree", {})  # type: ignore[attr-defined]
        frame_ids = self._get_all_frame_ids(frame_tree["frameTree"])
        main_frame_id = frame_tree["frameTree"]["frame"]["id"]
        logger.debug(f"Found {len(frame_ids)} frames")

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

        logger.debug(f"Total accessibility nodes collected: {len(all_nodes)}")

        try:
            shadow_nodes = self._build_shadow_hierarcy()
            all_nodes.extend(shadow_nodes)
            if shadow_nodes:
                logger.debug(f"  -> Shadow DOM: {len(shadow_nodes)} nodes added")
        except Exception as e:
            logger.debug(f"  -> Shadow DOM failed ({e})")

        return ChromiumAccessibilityTree({"nodes": all_nodes})

    @property
    def screenshot(self) -> str:
        if self.full_page_screenshot:
            return self.driver.execute_cdp_cmd(
                "Page.captureScreenshot",
                {
                    "format": "png",
                    "captureBeyondViewport": True,
                },
            )["data"]  # type: ignore[attr-defined]
        else:
            return self.driver.get_screenshot_as_base64()

    def find_element(self, id: int) -> WebElement:
        accessibility_element = self.accessibility_tree.element_by_id(id)

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
        selector = f"[data-alumnium-id='{backend_node_id}']"
        host_backend_node_id = (
            self._shadow_child_to_host_map.get(backend_node_id) if backend_node_id is not None else None
        )

        search_context = self.driver
        if host_backend_node_id is not None:
            search_context = self._find_shadow_root(host_backend_node_id)
        element = search_context.find_element(By.CSS_SELECTOR, selector)
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

    def print_to_pdf(self, filepath: str):
        result = self.driver.execute_cdp_cmd("Page.printToPDF", {})  # type: ignore[attr-defined]
        with open(filepath, "wb") as f:
            f.write(b64decode(result["data"]))

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

    def _find_shadow_root(self, host_backend_node_id: int):
        host_node_ids = self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
            "DOM.pushNodesByBackendIdsToFrontend", {"backendNodeIds": [host_backend_node_id]}
        )["nodeIds"]
        if not host_node_ids:
            raise ValueError(f"CDP did not return a node id for host {host_backend_node_id}")
        host_node_id = host_node_ids[0]
        self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
            "DOM.setAttributeValue",
            {
                "nodeId": host_node_id,
                "name": "data-alumnium-host",
                "value": str(host_backend_node_id),
            },
        )
        try:
            host_element = self.driver.find_element(  # type: ignore[attr-defined]
                By.CSS_SELECTOR, f"[data-alumnium-host='{host_backend_node_id}']"
            )
        finally:
            self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
                "DOM.removeAttribute",
                {"nodeId": host_node_id, "name": "data-alumnium-host"},
            )
        return host_element.shadow_root

    def _build_shadow_hierarcy(self) -> list[dict]:
        shadow_nodes: list[dict] = []
        processed_nodes: set[str] = set()

        # Enable DOM domain for node operations
        self.driver.execute_cdp_cmd("DOM.enable", {})  # type: ignore[attr-defined]

        # Get all DOM nodes including shadow DOM content
        dom_response = self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
            "DOM.getFlattenedDocument", {"depth": -1, "pierce": True}
        )

        dom_nodes = dom_response.get("nodes", [])
        if not dom_nodes:
            return shadow_nodes

        # Build maps from the DOM tree
        node_id_to_backend_id: dict[int, int] = {}
        parent_id_map: dict[int, int] = {}
        shadow_root_to_host_backend_id: dict[int, int] = {}

        for dom_node in dom_nodes:
            node_id = dom_node.get("nodeId")
            backend_node_id = dom_node.get("backendNodeId")
            if node_id is not None and backend_node_id is not None:
                node_id_to_backend_id[node_id] = backend_node_id
            if node_id is not None and dom_node.get("parentId") is not None:
                parent_id_map[node_id] = dom_node["parentId"]
            # Track shadow roots and their host's backendNodeId
            if node_id is not None and backend_node_id is not None:
                for sr in dom_node.get("shadowRoots", []):
                    sr_node_id = sr.get("nodeId")
                    if sr_node_id is not None:
                        shadow_root_to_host_backend_id[sr_node_id] = backend_node_id
                        parent_id_map[sr_node_id] = node_id

        # Build child_backend_node_id -> host_backend_node_id map by walking parent chains
        self._shadow_child_to_host_map = {}
        for dom_node in dom_nodes:
            node_backend_id = dom_node.get("backendNodeId")
            if node_backend_id is None:
                continue
            current_id: int | None = dom_node.get("nodeId")
            while current_id is not None:
                if current_id in shadow_root_to_host_backend_id:
                    self._shadow_child_to_host_map[node_backend_id] = shadow_root_to_host_backend_id[current_id]
                    break
                current_id = parent_id_map.get(current_id)

        # Find shadow hosts and collect their accessibility nodes
        for dom_node in dom_nodes:
            if not dom_node.get("shadowRoots"):
                continue
            try:
                ax_response = self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
                    "Accessibility.queryAXTree", {"nodeId": dom_node["nodeId"]}
                )
                for ax_node in ax_response.get("nodes", []):
                    node_id_str = str(ax_node.get("nodeId", ""))
                    if node_id_str in processed_nodes:
                        continue
                    processed_nodes.add(node_id_str)

                    ax_node["_is_shadow_dom"] = True
                    if not ax_node.get("backendDOMNodeId"):
                        backend_id = node_id_to_backend_id.get(ax_node.get("nodeId"))
                        if backend_id is not None:
                            ax_node["backendDOMNodeId"] = backend_id

                    shadow_nodes.append(ax_node)

                    for child_id in ax_node.get("childIds", []):
                        child_nodes = self._get_shadow_child_nodes(
                            str(child_id), processed_nodes, node_id_to_backend_id
                        )
                        shadow_nodes.extend(child_nodes)
            except Exception:
                pass  # Ignore errors for individual shadow hosts

        return shadow_nodes

    def _get_shadow_child_nodes(
        self,
        node_id: str,
        processed_nodes: set[str],
        node_id_to_backend_id: dict[int, int],
    ) -> list[dict]:
        nodes: list[dict] = []

        if node_id in processed_nodes:
            return nodes
        processed_nodes.add(node_id)

        try:
            response = self.driver.execute_cdp_cmd(  # type: ignore[attr-defined]
                "Accessibility.queryAXTree", {"nodeId": int(node_id)}
            )
            for node in response.get("nodes", []):
                node["_is_shadow_dom"] = True

                if not node.get("backendDOMNodeId"):
                    backend_id = node_id_to_backend_id.get(node.get("nodeId"))
                    if backend_id is not None:
                        node["backendDOMNodeId"] = backend_id

                nodes.append(node)

                for child_id in node.get("childIds", []):
                    child_nodes = self._get_shadow_child_nodes(str(child_id), processed_nodes, node_id_to_backend_id)
                    nodes.extend(child_nodes)
        except Exception:
            pass  # Ignore errors for individual nodes

        return nodes
