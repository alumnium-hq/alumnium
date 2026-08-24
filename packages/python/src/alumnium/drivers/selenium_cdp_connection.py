import json
from itertools import count
from threading import Event, Lock, Thread, current_thread
from time import monotonic, sleep

import requests
from websocket import create_connection

from .cdp_network_monitor import CdpNetworkMonitor

NETWORK_EVENTS = {
    "Network.requestWillBeSent",
    "Network.responseReceived",
    "Network.dataReceived",
    "Network.loadingFinished",
    "Network.loadingFailed",
}
AUTO_ATTACH_PARAMS = {"autoAttach": True, "waitForDebuggerOnStart": True, "flatten": True}
TIMEOUT = 5


class SeleniumCdpConnection:
    def __init__(self, capabilities: dict, waiter_script: str):
        self.waiter_script = waiter_script
        self._ids = count(1)
        self._pending: dict[int, tuple[Event, dict]] = {}
        self._pending_lock = Lock()
        self._send_lock = Lock()
        self._state_lock = Lock()
        self._target_sessions: dict[str, str] = {}
        self._session_parents: dict[str, str] = {}
        self._session_configurations: dict[str, tuple[Event, list[Exception]]] = {}
        self._active_session = ""
        self._target_monitors: dict[str, CdpNetworkMonitor] = {}
        self._closed = False
        self._socket = create_connection(self._websocket_url(capabilities), timeout=TIMEOUT, suppress_origin=True)
        self._socket.settimeout(None)
        self._reader = Thread(target=self._read_messages, name="alumnium-cdp", daemon=True)
        self._reader.start()
        try:
            self.send(
                "Target.setAutoAttach",
                AUTO_ATTACH_PARAMS,
            )
            self.send("Target.setDiscoverTargets", {"discover": True})
            targets = self.send("Target.getTargets").get("targetInfos", [])
            for target in targets:
                if target.get("type") == "page":
                    self._await_session(target["targetId"])
        except Exception:
            self.close()
            raise

    def activate(self, window_handle: str):
        target_id = window_handle.removeprefix("CDwindow-")
        session_id = self._await_session(target_id)
        with self._state_lock:
            self._active_session = session_id

    @property
    def active_monitor(self) -> CdpNetworkMonitor:
        with self._state_lock:
            session_id = self._active_session
        return self._monitor_for_session(session_id)

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
        try:
            with self._send_lock:
                self._socket.send(json.dumps(message))
        except Exception:
            if wait:
                with self._pending_lock:
                    self._pending.pop(command_id, None)
            raise

        if not wait:
            return {}
        if not event.wait(TIMEOUT):
            with self._pending_lock:
                timed_out = not event.is_set()
                if timed_out:
                    self._pending.pop(command_id, None)
            if timed_out:
                raise TimeoutError(f"Timed out sending CDP command {method}")
        if "error" in response:
            raise RuntimeError(response["error"].get("message", f"CDP command {method} failed"))
        return response.get("result", {})

    def close(self):
        self._closed = True
        try:
            self._socket.close()
        except Exception:
            pass
        self._fail_pending_commands()
        if current_thread() is not self._reader:
            self._reader.join(timeout=1)

    def _read_messages(self):
        try:
            while not self._closed:
                message = json.loads(self._socket.recv())
                self._process_message(message)
        except Exception:
            self._closed = True
            self._fail_pending_commands()

    def _process_message(self, message: dict):
        command_id = message.get("id")
        if command_id is not None:
            with self._pending_lock:
                pending = self._pending.get(command_id)
                if pending:
                    event, response = pending
                    response.update(message)
                    event.set()
                    self._pending.pop(command_id, None)
            return

        method = message.get("method", "")
        params = message.get("params", {})
        session_id = message.get("sessionId", "")
        if method in NETWORK_EVENTS:
            self._monitor_for_session(session_id).process(method, params, session_id)
        elif method == "Target.attachedToTarget":
            self._on_attached_to_target(params, session_id)
        elif method == "Target.detachedFromTarget":
            self._on_detached_from_target(params.get("sessionId", ""))

    def _on_attached_to_target(self, params: dict, parent_session_id: str):
        target = params.get("targetInfo", {})
        if target.get("type") not in {"page", "iframe"}:
            return

        session_id = params["sessionId"]
        target_id = target.get("targetId", "")
        with self._state_lock:
            if target_id:
                self._target_sessions[target_id] = session_id
            self._session_parents[session_id] = parent_session_id
        self._start_session_configuration(session_id)

    def _on_detached_from_target(self, session_id: str):
        with self._state_lock:
            root_session = self._root_session_locked(session_id)
            detached_sessions = {session_id}
            detached_sessions.update(
                candidate for candidate in self._session_parents if self._is_descendant_locked(candidate, session_id)
            )
            monitor = self._target_monitors.get(root_session)
            for detached_session in detached_sessions:
                if monitor:
                    monitor.clear_session(detached_session)
                self._session_parents.pop(detached_session, None)
                self._session_configurations.pop(detached_session, None)
            target_ids = [
                target_id for target_id, attached in self._target_sessions.items() if attached in detached_sessions
            ]
            for target_id in target_ids:
                self._target_sessions.pop(target_id, None)
            if session_id == root_session:
                self._target_monitors.pop(root_session, None)
            if self._active_session in detached_sessions:
                self._active_session = ""

    def _start_session_configuration(self, session_id: str):
        Thread(
            target=self._configure_session_safely,
            args=(session_id,),
            name="alumnium-cdp-configure",
            daemon=True,
        ).start()

    def _configure_session_safely(self, session_id: str):
        try:
            self._configure_session(session_id)
        except Exception:
            pass

    def _configure_session(self, session_id: str) -> tuple[Event, list[Exception]]:
        with self._state_lock:
            existing = self._session_configurations.get(session_id)
            if existing:
                return existing
            configuration: tuple[Event, list[Exception]] = (Event(), [])
            self._session_configurations[session_id] = configuration
        event, errors = configuration
        try:
            self.send("Target.setAutoAttach", AUTO_ATTACH_PARAMS, session_id)
            self.send("Page.enable", session_id=session_id)
            self.send("Network.enable", session_id=session_id)
            self.send(
                "Page.addScriptToEvaluateOnNewDocument",
                {"source": self.waiter_script, "runImmediately": True},
                session_id,
            )
            self.send("Runtime.runIfWaitingForDebugger", session_id=session_id)
        except Exception as error:
            errors.append(error)
            raise
        finally:
            event.set()
        return configuration

    def _await_session(self, target_id: str) -> str:
        deadline = monotonic() + TIMEOUT
        while monotonic() < deadline:
            with self._state_lock:
                session_id = self._target_sessions.get(target_id, "")
                configuration = self._session_configurations.get(session_id)
            if configuration:
                event, errors = configuration
                event.wait(max(0, deadline - monotonic()))
                if not event.is_set():
                    return ""
                if errors:
                    raise errors[0]
                return session_id
            sleep(0.01)
        return ""

    def _root_session(self, session_id: str) -> str:
        with self._state_lock:
            return self._root_session_locked(session_id)

    def _root_session_locked(self, session_id: str) -> str:
        current = session_id
        visited = set()
        while current not in visited:
            visited.add(current)
            parent = self._session_parents.get(current)
            if not parent:
                break
            current = parent
        return current

    def _is_descendant_locked(self, session_id: str, ancestor: str) -> bool:
        current = session_id
        visited = set()
        while current not in visited:
            visited.add(current)
            parent = self._session_parents.get(current)
            if not parent:
                return False
            if parent == ancestor:
                return True
            current = parent
        return False

    def _monitor_for_session(self, session_id: str) -> CdpNetworkMonitor:
        root_session = self._root_session(session_id)
        with self._state_lock:
            monitor = self._target_monitors.get(root_session)
            if monitor is None:
                monitor = CdpNetworkMonitor()
                self._target_monitors[root_session] = monitor
            return monitor

    def _fail_pending_commands(self):
        with self._pending_lock:
            pending = list(self._pending.values())
            self._pending.clear()
        for event, response in pending:
            response["error"] = {"message": "CDP connection closed"}
            event.set()

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
        response = requests.get(f"http://{debugger_address}/json/version", timeout=TIMEOUT)
        response.raise_for_status()
        return response.json()["webSocketDebuggerUrl"]
