import json
from itertools import count
from threading import Event, Lock, Thread

import requests
from websocket import create_connection

from .cdp_network_monitor import CdpNetworkMonitor

NETWORK_EVENTS = {
    "Network.requestWillBeSent",
    "Network.responseReceived",
    "Network.loadingFinished",
    "Network.loadingFailed",
}


class SeleniumCdpConnection:
    def __init__(self, capabilities: dict, monitor: CdpNetworkMonitor, waiter_script: str):
        self.monitor = monitor
        self.waiter_script = waiter_script
        self._ids = count(1)
        self._pending: dict[int, tuple[Event, dict]] = {}
        self._pending_lock = Lock()
        self._send_lock = Lock()
        self._closed = False
        self._socket = create_connection(self._websocket_url(capabilities), timeout=5, suppress_origin=True)
        self._socket.settimeout(None)
        self._reader = Thread(target=self._read_messages, name="alumnium-cdp", daemon=True)
        self._reader.start()
        self.send(
            "Target.setAutoAttach",
            {"autoAttach": True, "waitForDebuggerOnStart": False, "flatten": True},
        )
        self.send("Target.setDiscoverTargets", {"discover": True})
        targets = self.send("Target.getTargets").get("targetInfos", [])
        for target in targets:
            if target.get("type") == "page":
                result = self.send("Target.attachToTarget", {"targetId": target["targetId"], "flatten": True})
                self._configure_session(result["sessionId"])

    def send(self, method: str, params: dict | None = None, session_id: str = "", wait: bool = True) -> dict:
        command_id = next(self._ids)
        message = {"id": command_id, "method": method, "params": params or {}}
        if session_id:
            message["sessionId"] = session_id

        event = Event()
        response: dict = {}
        if wait:
            with self._pending_lock:
                self._pending[command_id] = (event, response)
        with self._send_lock:
            self._socket.send(json.dumps(message))

        if not wait:
            return {}
        if not event.wait(5):
            with self._pending_lock:
                self._pending.pop(command_id, None)
            raise TimeoutError(f"Timed out sending CDP command {method}")
        if "error" in response:
            raise RuntimeError(response["error"].get("message", f"CDP command {method} failed"))
        return response.get("result", {})

    def close(self):
        self._closed = True
        self._socket.close()

    def _read_messages(self):
        while not self._closed:
            try:
                message = json.loads(self._socket.recv())
            except Exception:
                return

            command_id = message.get("id")
            if command_id is not None:
                with self._pending_lock:
                    pending = self._pending.pop(command_id, None)
                if pending:
                    event, response = pending
                    response.update(message)
                    event.set()
                continue

            method = message.get("method", "")
            params = message.get("params", {})
            session_id = message.get("sessionId", "")
            if method in NETWORK_EVENTS:
                self.monitor.process(method, params, session_id)
            elif method == "Target.attachedToTarget":
                target = params.get("targetInfo", {})
                if target.get("type") in {"page", "iframe"}:
                    self._configure_session(params["sessionId"], wait=False)
            elif method == "Target.targetCreated" and params.get("targetInfo", {}).get("type") == "page":
                self.send(
                    "Target.attachToTarget",
                    {"targetId": params["targetInfo"]["targetId"], "flatten": True},
                    wait=False,
                )
            elif method == "Target.detachedFromTarget":
                self.monitor.clear_session(params.get("sessionId", ""))

    def _configure_session(self, session_id: str, wait: bool = True):
        self.send(
            "Target.setAutoAttach",
            {"autoAttach": True, "waitForDebuggerOnStart": False, "flatten": True},
            session_id,
            wait,
        )
        self.send("Page.enable", session_id=session_id, wait=wait)
        self.send("Network.enable", session_id=session_id, wait=wait)
        self.send(
            "Page.addScriptToEvaluateOnNewDocument",
            {"source": self.waiter_script, "runImmediately": True},
            session_id,
            wait,
        )

    @staticmethod
    def _websocket_url(capabilities: dict) -> str:
        cdp_url = capabilities.get("se:cdp")
        if cdp_url:
            return cdp_url

        debugger_address = capabilities.get("goog:chromeOptions", {}).get("debuggerAddress") or capabilities.get(
            "ms:edgeOptions", {}
        ).get("debuggerAddress")
        if not debugger_address:
            raise RuntimeError("Chrome did not expose a CDP debugger address")
        response = requests.get(f"http://{debugger_address}/json/version", timeout=5)
        response.raise_for_status()
        return response.json()["webSocketDebuggerUrl"]
