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
    content_length: int | None = None
    received: int = 0


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
        elif method == "Network.dataReceived":
            self._data_received(params, session_id)
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
            return

        content_length = headers.get("content-length")
        if content_length is None:
            return
        try:
            parsed_content_length = int(content_length)
        except ValueError:
            return
        if parsed_content_length < 0:
            return

        with self._lock:
            key = self._request_key(params.get("requestId"), session_id)
            if not key:
                return
            request = self._pending.get(key)
            if not request:
                return
            request.content_length = parsed_content_length
            if request.received >= parsed_content_length:
                self._finish_key(key)

    def _data_received(self, params: dict, session_id: str):
        with self._lock:
            key = self._request_key(params.get("requestId"), session_id)
            if not key:
                return
            request = self._pending.get(key)
            if not request:
                return
            request.received += params.get("encodedDataLength") or params.get("dataLength") or 0
            if request.content_length is not None and request.received >= request.content_length:
                self._finish_key(key)

    def _request_finished(self, params: dict, session_id: str):
        request_id = params.get("requestId")
        if not request_id:
            return
        with self._lock:
            key = self._request_key(request_id, session_id)
            if key:
                self._finish_key(key)

    def _request_key(self, request_id: str | None, session_id: str) -> tuple[str, str] | None:
        if not request_id:
            return None
        key = (session_id, request_id)
        if key in self._pending:
            return key
        transferred = [key for key in self._pending if key[1] == request_id]
        return transferred[0] if len(transferred) == 1 else None

    def _finish_key(self, key: tuple[str, str]):
        if self._pending.pop(key, None) is not None:
            self._last_activity_at = monotonic()
