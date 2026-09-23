import json
from itertools import count
from threading import Event, Lock, Thread, current_thread
from time import monotonic, sleep

import requests
from websocket import create_connection

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
        self._session_configurations: dict[str, tuple[Event, list[Exception]]] = {}
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
        if method == "Target.attachedToTarget":
            self._on_attached_to_target(params)
        elif method == "Target.detachedFromTarget":
            self._on_detached_from_target(params.get("sessionId", ""))

    def _on_attached_to_target(self, params: dict):
        target = params.get("targetInfo", {})
        session_id = params["sessionId"]
        configure = target.get("type") in {"page", "iframe"}
        target_id = target.get("targetId", "")
        if configure and target_id:
            with self._state_lock:
                self._target_sessions[target_id] = session_id
        self._start_session_configuration(session_id, configure)

    def _on_detached_from_target(self, session_id: str):
        with self._state_lock:
            self._session_configurations.pop(session_id, None)
            target_ids = [target_id for target_id, attached in self._target_sessions.items() if attached == session_id]
            for target_id in target_ids:
                self._target_sessions.pop(target_id, None)

    def _start_session_configuration(self, session_id: str, configure: bool):
        Thread(
            target=self._configure_session_safely,
            args=(session_id, configure),
            name="alumnium-cdp-configure",
            daemon=True,
        ).start()

    def _configure_session_safely(self, session_id: str, configure: bool):
        try:
            try:
                if configure:
                    event, _ = self._configure_session(session_id)
                    event.wait()
            finally:
                self.send("Runtime.runIfWaitingForDebugger", session_id=session_id)
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
            self.send(
                "Page.addScriptToEvaluateOnNewDocument",
                {"source": self.waiter_script, "runImmediately": True},
                session_id,
            )
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
