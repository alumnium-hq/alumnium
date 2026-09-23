from itertools import count
from threading import Event, Lock

from pytest import MonkeyPatch, mark

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
    cdp._session_configurations = {}
    cdp._closed = False
    return cdp


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
        "Page.addScriptToEvaluateOnNewDocument",
    ]


@mark.parametrize("target_type", ["page", "iframe", "worker", "shared_worker", "service_worker"])
def test_resumes_every_attached_target(monkeypatch: MonkeyPatch, target_type: str):
    cdp = connection()
    commands = []
    monkeypatch.setattr(cdp, "send", lambda method, *args, **kwargs: commands.append(method) or {})
    monkeypatch.setattr(cdp, "_start_session_configuration", cdp._configure_session_safely)

    cdp._on_attached_to_target({"sessionId": "session", "targetInfo": {"targetId": "target", "type": target_type}})

    assert commands[-1] == "Runtime.runIfWaitingForDebugger"
    if target_type in {"page", "iframe"}:
        assert commands[-2] == "Page.addScriptToEvaluateOnNewDocument"
    else:
        assert commands == ["Runtime.runIfWaitingForDebugger"]


def test_resumes_target_when_configuration_fails(monkeypatch: MonkeyPatch):
    cdp = connection()
    commands = []

    def send(method, *args, **kwargs):
        commands.append(method)
        if method == "Page.enable":
            raise RuntimeError("Configuration failed")
        return {}

    monkeypatch.setattr(cdp, "send", send)
    monkeypatch.setattr(cdp, "_start_session_configuration", cdp._configure_session_safely)

    cdp._on_attached_to_target({"sessionId": "session", "targetInfo": {"targetId": "target", "type": "page"}})

    assert commands == ["Target.setAutoAttach", "Page.enable", "Runtime.runIfWaitingForDebugger"]


def test_duplicate_attachment_waits_for_existing_configuration(monkeypatch: MonkeyPatch):
    cdp = connection()
    configured = Event()
    resumed = Event()
    cdp._session_configurations["session"] = (configured, [])
    monkeypatch.setattr(cdp, "send", lambda *args, **kwargs: resumed.set() or {})

    cdp._start_session_configuration("session", True)
    try:
        assert not resumed.wait(0.05)
    finally:
        configured.set()
    assert resumed.wait(1)


def test_connection_failure_wakes_pending_commands():
    cdp = connection()
    event = Event()
    response = {}
    cdp._pending[1] = (event, response)

    cdp._fail_pending_commands()

    assert event.is_set()
    assert response == {"error": {"message": "CDP connection closed"}}
    assert cdp._pending == {}
