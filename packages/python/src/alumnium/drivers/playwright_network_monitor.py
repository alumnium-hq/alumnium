from itertools import count

from playwright import async_api, sync_api

from .cdp_network_monitor import IGNORED_RESOURCE_TYPES, CdpNetworkMonitor

Page = sync_api.Page | async_api.Page
Request = sync_api.Request | async_api.Request
Response = sync_api.Response | async_api.Response
RESOURCE_TYPES = {resource_type.lower(): resource_type for resource_type in IGNORED_RESOURCE_TYPES}


class PlaywrightNetworkMonitor:
    """Supplement CDP with context events for requests that start before a popup's CDP session attaches.

    Playwright's public CDPSession API cannot address the flattened child sessions created by
    browser-level auto-attach; attaching another session still races popup startup. Context listeners
    registered before the popup opens cover that gap and feed the same per-page CdpNetworkMonitor.
    """

    def __init__(self, context: sync_api.BrowserContext | async_api.BrowserContext):
        self._pages: dict[Page, CdpNetworkMonitor] = {}
        self._requests: dict[Request, tuple[CdpNetworkMonitor, str]] = {}
        self._ids = count(1)
        context.on("request", self._request_started)
        context.on("response", self._response_received)
        context.on("requestfinished", self._request_finished)
        context.on("requestfailed", self._request_finished)

    def for_page(self, page: Page) -> CdpNetworkMonitor:
        monitor = self._pages.get(page)
        if monitor is None:
            monitor = CdpNetworkMonitor()
            self._pages[page] = monitor
            page.on("close", self._remove_page)
        return monitor

    def clear_session(self, page: Page, session_id: str):
        monitor = self._pages.get(page)
        if monitor is not None:
            monitor.clear_session(session_id)

    def _remove_page(self, page: Page):
        monitor = self._pages.pop(page, None)
        if monitor is None:
            return
        monitor.clear()
        self._requests = {request: state for request, state in self._requests.items() if state[0] is not monitor}

    def _request_started(self, request: Request):
        try:
            page = request.frame.page
        except sync_api.Error:
            # Popup navigation and service-worker requests may have no page yet.
            return
        if page.is_closed():
            return
        monitor = self.for_page(page)
        request_id = f"pw:{next(self._ids)}"
        self._requests[request] = (monitor, request_id)
        monitor.process(
            "Network.requestWillBeSent",
            {
                "requestId": request_id,
                "type": RESOURCE_TYPES.get(request.resource_type, request.resource_type),
                "request": {"url": request.url},
            },
            "playwright",
        )

    def _response_received(self, response: Response):
        state = self._requests.get(response.request)
        if state is None:
            return
        monitor, request_id = state
        monitor.process(
            "Network.responseReceived",
            {"requestId": request_id, "response": {"headers": response.headers}},
            "playwright",
        )

    def _request_finished(self, request: Request):
        state = self._requests.pop(request, None)
        if state is not None:
            monitor, request_id = state
            monitor.process("Network.loadingFinished", {"requestId": request_id}, "playwright")
