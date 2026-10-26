import json
from base64 import b64decode
from pathlib import Path
from threading import Lock
from time import monotonic, sleep
from typing import Callable

from selenium.webdriver.remote.webdriver import WebDriver
from selenium.webdriver.remote.webelement import WebElement

from ...accessibility import AriaAccessibilityTree
from ...logutils import get_logger
from ..selenium_driver import SeleniumDriver
from ..waiter import WAITER_SCRIPT

logger = get_logger(__name__)

with open(Path(__file__).parent.parent / "scripts/acquiescence.js") as acquiescence_file:
    ACQUIESCENCE_SCRIPT = acquiescence_file.read()

with open(Path(__file__).parent.parent / "scripts/ariaSnapshot.js") as snapshot_file:
    SNAPSHOT_FUNCTION = snapshot_file.read()

SANDBOX = "alumnium"

ACQUIESCENCE_FUNCTION = f"""() => {{
{ACQUIESCENCE_SCRIPT}
globalThis.Acquiescence = Acquiescence;
}}"""

NAVIGATION_START_TIMEOUT = 0.25
NAVIGATION_LOAD_TIMEOUT = 10
NAVIGATION_POLL_INTERVAL = 0.05

NAVIGATION_STARTED_EVENT = "browsingContext.navigationStarted"
NAVIGATION_FINISHED_EVENTS = [
    "browsingContext.load",
    "browsingContext.navigationAborted",
    "browsingContext.navigationFailed",
]
CONTEXT_CREATED_EVENT = "browsingContext.contextCreated"
CONTEXT_DESTROYED_EVENT = "browsingContext.contextDestroyed"
NAVIGATION_EVENTS = [
    CONTEXT_CREATED_EVENT,
    CONTEXT_DESTROYED_EVENT,
    NAVIGATION_STARTED_EVENT,
    *NAVIGATION_FINISHED_EVENTS,
]


class BiDiDriver(SeleniumDriver):
    """
    Selenium driver for Firefox (WebDriver BiDi). Builds accessibility trees with acquiescence
    over WebDriver BiDi instead of CDP, and locates elements by BiDi shared IDs,
    which Firefox accepts as WebDriver element references.

    Requires BiDi to be enabled (`options.enable_bidi = True`). Frames and
    shadow DOM are not supported yet.
    """

    def __init__(self, driver: WebDriver):
        self._navigation_lock = Lock()
        self._tracking_navigation = False
        self._navigation_start_deadline = 0.0
        # Navigation (or context, when the event has no navigation) -> its context.
        self._started_navigations: dict[str, str] = {}
        self._finished_navigations: set[str] = set()
        self._destroyed_contexts: set[str] = set()
        super().__init__(driver)

    @property
    def platform(self) -> str:
        return "firefox"

    def _fetch_accessibility_tree(self) -> AriaAccessibilityTree:
        self.driver.switch_to.default_content()
        # A new tab might take the foreground and leave the current one hidden.
        context = self.driver.current_window_handle
        self.driver.switch_to.window(context)

        self._wait_for_page_to_load()

        result = self._call_in_sandbox(context, SNAPSHOT_FUNCTION)
        if result["type"] == "null":
            logger.debug("Acquiescence is not preloaded, loading it into the page")
            self._call_in_sandbox(context, ACQUIESCENCE_FUNCTION)
            result = self._call_in_sandbox(context, SNAPSHOT_FUNCTION)

        snapshot_value, elements_value = result["value"]
        snapshot = json.loads(snapshot_value["value"])
        refs: list[str] = snapshot["refs"]
        elements: list[dict] = elements_value["value"]

        shared_ids: dict[str, str] = {}
        for ref, element in zip(refs, elements):
            shared_id = element.get("sharedId")
            if shared_id:
                shared_ids[ref] = shared_id
        logger.debug(f"Accessibility snapshot has {len(refs)} referenced nodes")

        return AriaAccessibilityTree(snapshot["root"], shared_ids, snapshot.get("values"))

    def find_element(self, id: int) -> WebElement:
        shared_id = self.accessibility_tree.element_by_id(id).shared_id
        if not shared_id:
            raise ValueError(f"Element with raw_id={id} has no shared ID")

        # Snapshots only cover the top-level document.
        self.driver.switch_to.default_content()
        return self.driver.create_web_element(shared_id)

    @property
    def screenshot(self) -> str:
        if not self.full_page_screenshot:
            return self.driver.get_screenshot_as_base64()

        return self._send_bidi_command(
            "browsingContext.captureScreenshot",
            {"context": self.driver.current_window_handle, "origin": "document"},
        )["data"]

    def print_to_pdf(self, filepath: str):
        result = self._send_bidi_command("browsingContext.print", {"context": self.driver.current_window_handle})
        with open(filepath, "wb") as f:
            f.write(b64decode(result["data"]))

    def _with_navigation_wait(self, func: Callable):
        """
        GeckoDriver doesn't wait for navigations started by actions.
        Same-document navigations aren't waited for.
        """
        with self._navigation_lock:
            self._tracking_navigation = True
            self._navigation_start_deadline = 0.0
            self._started_navigations.clear()
            self._finished_navigations.clear()
            self._destroyed_contexts.clear()

        try:
            result = func()

            # Navigations are given a moment to start after the action, extended for
            # new tabs, which start blank and only navigate after being created.
            now = monotonic()
            load_deadline = now + NAVIGATION_LOAD_TIMEOUT
            with self._navigation_lock:
                self._navigation_start_deadline = max(self._navigation_start_deadline, now + NAVIGATION_START_TIMEOUT)

            while True:
                with self._navigation_lock:
                    pending = self._pending_navigations()
                    start_deadline = self._navigation_start_deadline
                if not pending and monotonic() >= start_deadline:
                    break
                if monotonic() > load_deadline:
                    logger.warning(f"Timed out waiting for navigation to load in {pending} tab(s)")
                    break
                sleep(NAVIGATION_POLL_INTERVAL)

            return result
        finally:
            with self._navigation_lock:
                self._tracking_navigation = False

    def _pending_navigations(self) -> int:
        return len(
            {
                context
                for navigation, context in self._started_navigations.items()
                if navigation not in self._finished_navigations and context not in self._destroyed_contexts
            }
        )

    def _on_navigation_event(self, method: str, params: dict):
        # Selenium runs each callback in its own thread, so events may be handled
        # out of order. Navigations are therefore tracked by ID rather than by
        # adding and removing contexts.
        context = params.get("context", "")
        navigation = params.get("navigation") or context
        with self._navigation_lock:
            if not self._tracking_navigation:
                return
            if method == CONTEXT_CREATED_EVENT:
                self._navigation_start_deadline = max(
                    self._navigation_start_deadline, monotonic() + NAVIGATION_START_TIMEOUT
                )
            elif method == CONTEXT_DESTROYED_EVENT:
                self._destroyed_contexts.add(context)
            elif method == NAVIGATION_STARTED_EVENT:
                self._started_navigations[navigation] = context
            elif method in NAVIGATION_FINISHED_EVENTS:
                self._finished_navigations.add(navigation)

    def _init_page_scripts(self):
        # Installed first, as the waiter must be in place before pages load.
        try:
            self._send_bidi_command(
                "script.addPreloadScript", {"functionDeclaration": f"() => {{\n{WAITER_SCRIPT}\n}}"}
            )
        except Exception as error:
            logger.debug(f"Could not install waiter script through BiDi: {error}")

        for event in NAVIGATION_EVENTS:
            try:
                self._send_bidi_command("session.subscribe", {"events": [event]})
                self._connection().add_callback(
                    _BiDiEvent(event), lambda params, event=event: self._on_navigation_event(event, params)
                )
            except Exception as error:
                logger.debug(f"Could not subscribe to {event} through BiDi: {error}")

        try:
            self._send_bidi_command(
                "script.addPreloadScript", {"functionDeclaration": ACQUIESCENCE_FUNCTION, "sandbox": SANDBOX}
            )
        except Exception as error:
            logger.debug(f"Could not preload acquiescence through BiDi: {error}")

    def _call_in_sandbox(self, context: str, function_declaration: str) -> dict:
        response = self._send_bidi_command(
            "script.callFunction",
            {
                "functionDeclaration": function_declaration,
                "awaitPromise": False,
                "target": {"context": context, "sandbox": SANDBOX},
                "resultOwnership": "none",
                "serializationOptions": {"maxDomDepth": 0},
            },
        )
        if response.get("type") == "exception" or "result" not in response:
            details = response.get("exceptionDetails", {}).get("text", "unknown error")
            raise RuntimeError(f"Failed to take accessibility snapshot: {details}")

        return response["result"]

    def _send_bidi_command(self, method: str, params: dict) -> dict:
        return self._connection().execute(_bidi_command(method, params))

    def _connection(self):
        if not self.driver.capabilities.get("webSocketUrl"):
            raise RuntimeError("Firefox support requires WebDriver BiDi, enable it with `options.enable_bidi = True`")

        if not self.driver._websocket_connection:
            self.driver._start_bidi()
        return self.driver._websocket_connection


def _bidi_command(method: str, params: dict):
    """Raw BiDi command in the generator form Selenium's WebSocket connection executes."""
    result = yield {"method": method, "params": params}
    return result


class _BiDiEvent:
    """Raw BiDi event in the form Selenium's WebSocket connection subscribes callbacks to."""

    def __init__(self, event_class: str):
        self.event_class = event_class

    def from_json(self, params: dict) -> dict:
        return params
