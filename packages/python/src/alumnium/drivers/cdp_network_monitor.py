from dataclasses import dataclass
from threading import Lock
from time import monotonic

IGNORED_RESOURCE_TYPES = {
    "CSPViolationReport",
    "EventSource",
    "Manifest",
    "Media",
    "Ping",
    "Prefetch",
    "WebSocket",
}
STREAMING_CONTENT_TYPES = ("text/event-stream", "multipart/x-mixed-replace")


@dataclass
class PendingRequest:
    url: str
    started_at: float


class CdpNetworkMonitor:
    def __init__(self):
        self._pending: dict[tuple[str, str], PendingRequest] = {}
        self._last_activity_at = monotonic()
        self._lock = Lock()

    def process(self, method: str, params: dict, session_id: str = ""):
        if method == "Network.requestWillBeSent":
            self._request_started(params, session_id)
        elif method == "Network.responseReceived":
            self._response_received(params, session_id)
        elif method in {
            "Network.loadingFinished",
            "Network.loadingFailed",
        }:
            self._request_finished(params, session_id)

    def pending(self) -> list[str]:
        with self._lock:
            return [request.url for request in self._pending.values()]

    @property
    def idle_for(self) -> float:
        with self._lock:
            return monotonic() - self._last_activity_at

    def clear(self):
        with self._lock:
            self._pending.clear()
            self._last_activity_at = monotonic()

    def clear_session(self, session_id: str):
        with self._lock:
            keys = [key for key in self._pending if key[0] == session_id]
            for key in keys:
                self._pending.pop(key, None)
            self._last_activity_at = monotonic()

    def _request_started(self, params: dict, session_id: str):
        request_id = params.get("requestId")
        if not request_id:
            return

        key = (session_id, request_id)
        with self._lock:
            if params.get("type") in IGNORED_RESOURCE_TYPES:
                self._pending.pop(key, None)
                return
            self._pending[key] = PendingRequest(params.get("request", {}).get("url", ""), monotonic())
            self._last_activity_at = monotonic()

    def _response_received(self, params: dict, session_id: str):
        response = params.get("response", {})
        headers = {name.lower(): str(value).lower() for name, value in response.get("headers", {}).items()}
        content_type = headers.get("content-type", response.get("mimeType", "")).split(";", 1)[0].strip().lower()
        if content_type in STREAMING_CONTENT_TYPES:
            self._request_finished(params, session_id)

    def _request_finished(self, params: dict, session_id: str):
        request_id = params.get("requestId")
        if not request_id:
            return
        with self._lock:
            if self._pending.pop((session_id, request_id), None) is not None:
                self._last_activity_at = monotonic()
