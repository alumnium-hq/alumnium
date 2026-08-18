from itertools import count
from threading import Event, Lock

from pytest import MonkeyPatch

from alumnium.drivers.selenium_cdp_connection import SeleniumCdpConnection


def connection() -> SeleniumCdpConnection:
    cdp = object.__new__(SeleniumCdpConnection)
    cdp.waiter_script = "waiter"
    cdp._ids = count(1)
    cdp._pending = {}
    cdp._pending_lock = Lock()
    cdp._send_lock = Lock()
    cdp._state_lock = Lock()
    cdp._target_sessions = {}
    cdp._session_parents = {}
    cdp._session_configurations = {}
    cdp._active_session = ""
    cdp._target_monitors = {}
    cdp._closed = False
    return cdp


def request(request_id: str, url: str) -> dict:
    return {
        "requestId": request_id,
        "type": "Fetch",
        "request": {"url": url},
    }


def test_routes_iframe_requests_to_its_root_page_monitor(monkeypatch: MonkeyPatch):
    cdp = connection()
    monkeypatch.setattr(cdp, "_start_session_configuration", lambda *_args: None)
    monkeypatch.setattr(cdp, "_await_session", lambda target_id: cdp._target_sessions.get(target_id, ""))
    cdp._on_attached_to_target(
        {"sessionId": "page-session", "targetInfo": {"targetId": "page", "type": "page"}},
        "",
    )
    cdp._on_attached_to_target(
        {"sessionId": "iframe-session", "targetInfo": {"targetId": "iframe", "type": "iframe"}},
        "page-session",
    )
    cdp._on_attached_to_target(
        {"sessionId": "other-session", "targetInfo": {"targetId": "other", "type": "page"}},
        "",
    )

    cdp._process_message(
        {
            "method": "Network.requestWillBeSent",
            "sessionId": "iframe-session",
            "params": request("1", "https://example.com/iframe"),
        }
    )
    cdp._process_message(
        {
            "method": "Network.requestWillBeSent",
            "sessionId": "other-session",
            "params": request("2", "https://example.com/other"),
        }
    )

    cdp.activate("CDwindow-page")
    assert cdp.active_monitor.pending() == ["https://example.com/iframe"]

    cdp.activate("CDwindow-other")
    assert cdp.active_monitor.pending() == ["https://example.com/other"]


def test_target_created_does_not_attach_explicitly(monkeypatch: MonkeyPatch):
    cdp = connection()
    commands = []
    monkeypatch.setattr(cdp, "send", lambda method, *args, **kwargs: commands.append(method) or {})

    cdp._process_message(
        {"method": "Target.targetCreated", "params": {"targetInfo": {"targetId": "target", "type": "page"}}}
    )

    assert commands == []


def test_configures_attached_session_once(monkeypatch: MonkeyPatch):
    cdp = connection()
    commands = []
    monkeypatch.setattr(cdp, "send", lambda method, *args, **kwargs: commands.append(method) or {})

    cdp._configure_session("session")
    cdp._configure_session("session")

    assert commands == [
        "Target.setAutoAttach",
        "Page.enable",
        "Network.enable",
        "Page.addScriptToEvaluateOnNewDocument",
        "Runtime.runIfWaitingForDebugger",
    ]


def test_connection_failure_wakes_pending_commands():
    cdp = connection()
    event = Event()
    response = {}
    cdp._pending[1] = (event, response)

    cdp._fail_pending_commands()

    assert event.is_set()
    assert response == {"error": {"message": "CDP connection closed"}}
    assert cdp._pending == {}
